import React, { useRef, useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Camera, Users, CheckCircle, XCircle, AlertCircle, Loader2, Eye, ArrowLeft, ArrowRight, Smile, ArrowUp } from 'lucide-react';
import { loadOptimizedModels, detectFacesOptimized } from '@/services/face-recognition/OptimizedModelService';
import { detectMultipleFaces, processBatchAttendance, resetMultipleFaceTracking } from '@/services/face-recognition/MultipleFaceService';
import { getRandomChallenges, verifyChallengeResponse, Challenge, ChallengeResult } from '@/services/face-recognition/ChallengeResponseService';
import { analyzeTextureForSpoofing } from '@/services/ai/FaceAnalysisService';
import * as faceapi from 'face-api.js';

interface ProcessedFace {
  id: string;
  name: string;
  status: 'present' | 'late' | 'unrecognized';
  confidence?: number;
  imageUrl?: string;
}

const MultipleFaceAttendanceCapture = () => {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [detectedFaces, setDetectedFaces] = useState<any[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedResults, setProcessedResults] = useState<ProcessedFace[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const [challengeResults, setChallengeResults] = useState<ChallengeResult[]>([]);
  const [challengeFrames, setChallengeFrames] = useState<ImageData[]>([]);
  const [challengeDetections, setChallengeDetections] = useState<any[]>([]);
  const [showChallengePrompt, setShowChallengePrompt] = useState(false);
  const detectionIntervalRef = useRef<number>();
  const streamRef = useRef<MediaStream | null>(null);
  const challengeStartTimeRef = useRef<number>(0);

  // Load models and start camera
  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        await loadOptimizedModels();
        if (isMounted) {
          setModelStatus('ready');
          await startCamera();
        }
      } catch (err) {
        console.error('Error loading models:', err);
        if (isMounted) {
          setModelStatus('error');
          toast({
            title: "Error",
            description: "Failed to load face recognition models.",
            variant: "destructive",
          });
        }
      }
    };

    initialize();

    return () => {
      isMounted = false;
      stopCamera();
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play();
            startFaceDetection();
          }
        };
      }
    } catch (err) {
      console.error('Error starting camera:', err);
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const startFaceDetection = () => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }

    const detectFaces = async () => {
      if (!videoRef.current || !canvasRef.current || isCapturing || isProcessing || showResults) {
        return;
      }

      try {
        const detections = await detectFacesOptimized(videoRef.current, {
          maxFaces: 50,
          classroomMode: true,
          skipFrames: false
        });

        setDetectedFaces(detections);
        drawFaceBoxes(detections);
      } catch (err) {
        console.error('Face detection error:', err);
      }
    };

    // Detect faces every 500ms for responsive feedback
    detectionIntervalRef.current = window.setInterval(detectFaces, 500);
  };

  const drawFaceBoxes = (detections: any[]) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach((detection, index) => {
      const box = detection.detection.box;
      
      // Draw bounding box
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      
      // Draw face number badge
      ctx.fillStyle = '#10b981';
      ctx.fillRect(box.x, box.y - 25, 40, 25);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`#${index + 1}`, box.x + 8, box.y - 7);
    });
  };

  const startChallengeVerification = () => {
    // Initialize challenges
    const newChallenges = getRandomChallenges(2);
    setChallenges(newChallenges);
    setCurrentChallengeIndex(0);
    setChallengeResults([]);
    setChallengeFrames([]);
    setChallengeDetections([]);
    setShowChallengePrompt(true);
    challengeStartTimeRef.current = Date.now();

    toast({
      title: "Anti-Spoofing Verification",
      description: "Please complete the challenges to verify you're real",
    });
  };

  const collectChallengeData = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    ctx.drawImage(videoRef.current, 0, 0);
    const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Detect face with landmarks and expressions
    const detection = await faceapi
      .detectSingleFace(videoRef.current)
      .withFaceLandmarks()
      .withFaceExpressions();

    if (detection) {
      setChallengeFrames(prev => [...prev, frameData]);
      setChallengeDetections(prev => [...prev, detection]);
    }
  };

  useEffect(() => {
    let intervalId: number;
    
    if (showChallengePrompt && currentChallengeIndex < challenges.length) {
      // Collect data every 100ms during challenge
      intervalId = window.setInterval(collectChallengeData, 100);

      // Auto-verify after challenge duration
      const currentChallenge = challenges[currentChallengeIndex];
      const timeoutId = window.setTimeout(async () => {
        await verifyCurrentChallenge();
      }, currentChallenge.duration);

      return () => {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
      };
    }
  }, [showChallengePrompt, currentChallengeIndex, challenges]);

  const verifyCurrentChallenge = async () => {
    const currentChallenge = challenges[currentChallengeIndex];
    
    // Get expressions for smile challenge
    const expressions = challengeDetections
      .filter(d => d.expressions)
      .map(d => d.expressions);

    const result = await verifyChallengeResponse(
      currentChallenge,
      challengeFrames,
      challengeDetections,
      expressions
    );

    setChallengeResults(prev => [...prev, result]);

    if (result.verified) {
      toast({
        title: "Challenge Passed ✓",
        description: result.details,
      });
    } else {
      toast({
        title: "Challenge Failed",
        description: result.details + ". Please try again.",
        variant: "destructive",
      });
    }

    // Move to next challenge or finish
    if (currentChallengeIndex < challenges.length - 1) {
      setCurrentChallengeIndex(prev => prev + 1);
      setChallengeFrames([]);
      setChallengeDetections([]);
    } else {
      // All challenges complete
      const allPassed = [...challengeResults, result].every(r => r.verified);
      setShowChallengePrompt(false);
      
      if (allPassed) {
        proceedWithCapture();
      } else {
        toast({
          title: "Verification Failed",
          description: "Please restart and complete all challenges correctly.",
          variant: "destructive",
        });
        // Reset for retry
        setChallenges([]);
        setChallengeResults([]);
        startFaceDetection();
      }
    }
  };

  const proceedWithCapture = async () => {
    if (detectedFaces.length === 0) {
      toast({
        title: "No Faces Detected",
        description: "Please ensure people are visible in the camera.",
        variant: "destructive",
      });
      return;
    }

    setIsCapturing(true);
    
    // Stop detection during capture
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }

    // Flash animation
    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 300);

    try {
      toast({
        title: "Capturing...",
        description: `Processing ${detectedFaces.length} detected faces...`,
      });

      // Wait for animation
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setIsProcessing(true);

      // Detect and recognize all faces with texture analysis
      if (!videoRef.current || !canvasRef.current) {
        throw new Error('Video not available');
      }

      // Perform texture analysis on each detected face
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        
        // Check texture for spoofing
        for (const face of detectedFaces) {
          const textureResult = analyzeTextureForSpoofing(canvas, face.detection);
          
          if (!textureResult.isRealSkin) {
            toast({
              title: "Spoofing Detected",
              description: "Video playback or screen detected. Please use real faces only.",
              variant: "destructive",
            });
            setIsCapturing(false);
            setIsProcessing(false);
            startFaceDetection();
            return;
          }
        }
      }

      const result = await detectMultipleFaces(videoRef.current, {
        enableRecognition: true,
        enableTracking: false,
        maxFaces: 50,
        classroomMode: true
      });

      // Process the results
      const processed: ProcessedFace[] = result.faces.map((face) => {
        if (face.recognition?.recognized && face.recognition.employee) {
          return {
            id: face.id,
            name: face.recognition.employee.name,
            status: 'present',
            confidence: face.recognition.confidence,
            imageUrl: face.recognition.employee.firebase_image_url
          };
        } else {
          return {
            id: face.id,
            name: 'Unknown Person',
            status: 'unrecognized',
            confidence: face.confidence
          };
        }
      });

      // Process batch attendance
      const batchResult = await processBatchAttendance(result.faces);

      setProcessedResults(processed);
      setShowResults(true);
      setIsProcessing(false);

      toast({
        title: "Processing Complete",
        description: `${batchResult.recognized} recognized, ${batchResult.processed - batchResult.recognized} unrecognized`,
      });

    } catch (err) {
      console.error('Capture error:', err);
      setIsProcessing(false);
      setIsCapturing(false);
      toast({
        title: "Processing Error",
        description: err instanceof Error ? err.message : "Failed to process faces",
        variant: "destructive",
      });
      startFaceDetection();
    }
  };

  const handleReset = () => {
    setShowResults(false);
    setProcessedResults([]);
    setDetectedFaces([]);
    setIsCapturing(false);
    resetMultipleFaceTracking();
    
    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    
    // Restart detection
    startFaceDetection();
    
    toast({
      title: "Reset Complete",
      description: "Ready to capture new attendance",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present': return 'text-green-600 bg-green-100 border-green-300';
      case 'late': return 'text-yellow-600 bg-yellow-100 border-yellow-300';
      case 'unrecognized': return 'text-red-600 bg-red-100 border-red-300';
      default: return 'text-gray-600 bg-gray-100 border-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'present': return <CheckCircle className="h-5 w-5" />;
      case 'late': return <AlertCircle className="h-5 w-5" />;
      case 'unrecognized': return <XCircle className="h-5 w-5" />;
      default: return null;
    }
  };

  return (
    <Card className="p-6">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Multiple Face Attendance
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Capture up to 50 faces simultaneously
        </p>
      </CardHeader>

      <CardContent className="px-0 pb-0">
        {modelStatus === 'error' ? (
          <div className="bg-destructive/10 border border-destructive rounded-lg p-4">
            <p className="text-sm text-destructive">
              Failed to load face recognition models. Please refresh the page.
            </p>
          </div>
        ) : modelStatus === 'loading' ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">Loading face recognition models...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {!showResults ? (
              <>
                {/* Camera View */}
                <div className="relative rounded-lg overflow-hidden bg-black">
                  {captureFlash && (
                    <div className="absolute inset-0 bg-white animate-[fade-out_0.3s_ease-out] z-20" />
                  )}
                  
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-auto"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                  
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full"
                    style={{ transform: 'scaleX(-1)' }}
                  />

                  {/* Face count overlay */}
                  {detectedFaces.length > 0 && (
                    <div className="absolute top-4 left-4 bg-primary/90 text-primary-foreground px-4 py-2 rounded-full font-medium flex items-center gap-2">
                      <div className="w-2 h-2 bg-primary-foreground rounded-full animate-pulse" />
                      {detectedFaces.length} face{detectedFaces.length !== 1 ? 's' : ''} detected
                    </div>
                  )}

                  {/* Challenge Prompt Overlay */}
                  {showChallengePrompt && currentChallengeIndex < challenges.length && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
                      <div className="bg-card border-2 border-primary rounded-2xl p-8 max-w-md text-center space-y-4 animate-in fade-in zoom-in duration-300">
                        <div className="text-6xl mb-4">
                          {challenges[currentChallengeIndex].type === 'blink' && <Eye className="h-16 w-16 mx-auto text-primary" />}
                          {challenges[currentChallengeIndex].type === 'turnLeft' && <ArrowLeft className="h-16 w-16 mx-auto text-primary" />}
                          {challenges[currentChallengeIndex].type === 'turnRight' && <ArrowRight className="h-16 w-16 mx-auto text-primary" />}
                          {challenges[currentChallengeIndex].type === 'smile' && <Smile className="h-16 w-16 mx-auto text-primary" />}
                          {challenges[currentChallengeIndex].type === 'nod' && <ArrowUp className="h-16 w-16 mx-auto text-primary" />}
                        </div>
                        <h3 className="text-2xl font-bold text-foreground">
                          {challenges[currentChallengeIndex].instruction}
                        </h3>
                        <p className="text-muted-foreground">
                          Challenge {currentChallengeIndex + 1} of {challenges.length}
                        </p>
                        <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all duration-100"
                            style={{ 
                              width: `${((Date.now() - challengeStartTimeRef.current) / challenges[currentChallengeIndex].duration) * 100}%` 
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {detectedFaces.length === 0 && "Position people in front of the camera"}
                    {detectedFaces.length > 0 && detectedFaces.length < 10 && "Good! More faces can be detected"}
                    {detectedFaces.length >= 10 && "Ready for batch capture"}
                  </div>
                  
                  <Button
                    onClick={startChallengeVerification}
                    disabled={isCapturing || isProcessing || detectedFaces.length === 0}
                    size="lg"
                    className="gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Camera className="h-5 w-5" />
                        Capture All ({detectedFaces.length})
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* Results View */}
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-4">
                    <Card className="p-4 bg-green-50 border-green-200">
                      <div className="text-center">
                        <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-green-600">
                          {processedResults.filter(r => r.status === 'present').length}
                        </p>
                        <p className="text-xs text-green-700">Present</p>
                      </div>
                    </Card>
                    
                    <Card className="p-4 bg-yellow-50 border-yellow-200">
                      <div className="text-center">
                        <AlertCircle className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-yellow-600">
                          {processedResults.filter(r => r.status === 'late').length}
                        </p>
                        <p className="text-xs text-yellow-700">Late</p>
                      </div>
                    </Card>
                    
                    <Card className="p-4 bg-red-50 border-red-200">
                      <div className="text-center">
                        <XCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-red-600">
                          {processedResults.filter(r => r.status === 'unrecognized').length}
                        </p>
                        <p className="text-xs text-red-700">Unrecognized</p>
                      </div>
                    </Card>
                  </div>

                  {/* Detailed Results */}
                  <div className="max-h-[400px] overflow-y-auto space-y-2">
                    {processedResults.map((result, index) => (
                      <div
                        key={result.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${getStatusColor(result.status)}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium">#{index + 1}</span>
                          <div>
                            <p className="font-medium">{result.name}</p>
                            {result.confidence && (
                              <p className="text-xs opacity-70">
                                Confidence: {(result.confidence * 100).toFixed(1)}%
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(result.status)}
                          <Badge variant="outline" className="capitalize">
                            {result.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Reset Button */}
                  <Button onClick={handleReset} variant="outline" className="w-full">
                    Capture New Attendance
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MultipleFaceAttendanceCapture;
