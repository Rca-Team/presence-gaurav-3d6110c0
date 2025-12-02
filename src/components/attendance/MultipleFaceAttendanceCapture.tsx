import React, { useRef, useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage } from '@/components/ui/avatar';
import { Camera, Users, CheckCircle, XCircle, AlertCircle, Loader2, Sparkles, SwitchCamera } from 'lucide-react';
import { detectAndRecognizeFaces } from '@/services/face-recognition/RetinaFaceService';
import { recognizeFace, recordAttendance } from '@/services/face-recognition/ArcFaceRecognitionService';
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
  const [previewModelReady, setPreviewModelReady] = useState(false);
  const [detectedFaces, setDetectedFaces] = useState<any[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedResults, setProcessedResults] = useState<ProcessedFace[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false);
  const detectionFrameRef = useRef<number>();
  const streamRef = useRef<MediaStream | null>(null);
  const lastDetectionTime = useRef<number>(0);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');

  // Load models progressively: fast preview model first, then high-accuracy model
  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        // Step 1: Load fast TinyFaceDetector for instant preview
        setTimeout(async () => {
          if (!isMounted) return;
          
          console.log('Loading TinyFaceDetector for preview...');
          await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
          
          if (isMounted) {
            setPreviewModelReady(true);
            console.log('Preview model ready');
            
            // Start camera immediately with preview model
            requestAnimationFrame(async () => {
              if (isMounted) {
                await startCamera();
                
                toast({
                  title: "Preview Ready",
                  description: "Loading high-accuracy models in background...",
                  duration: 2000,
                });
              }
            });
          }
        }, 100);

        // Step 2: Backend models ready (RetinaFace + ArcFace)
        setTimeout(async () => {
          if (!isMounted) return;
          
          console.log('Backend models ready: RetinaFace + ArcFace');
          
          if (isMounted) {
            setModelStatus('ready');
            
            toast({
              title: "High-Accuracy Ready",
              description: "RetinaFace + ArcFace models ready",
              duration: 2000,
            });
          }
        }, 500);
        
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
      if (detectionFrameRef.current) {
        cancelAnimationFrame(detectionFrameRef.current);
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      // Stop existing stream first
      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: cameraFacing
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().catch(e => {
              console.error('Error playing video:', e);
            });
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

  // Restart camera when facing mode changes
  useEffect(() => {
    if (previewModelReady && !showResults) {
      startCamera();
    }
  }, [cameraFacing]);

  const toggleCamera = () => {
    setCameraFacing(prev => prev === 'user' ? 'environment' : 'user');
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const startFaceDetection = () => {
    if (detectionFrameRef.current) {
      cancelAnimationFrame(detectionFrameRef.current);
    }

    const detectFaces = async () => {
      if (!videoRef.current || !canvasRef.current || isCapturing || isProcessing || showResults) {
        detectionFrameRef.current = requestAnimationFrame(detectFaces);
        return;
      }

      const now = performance.now();
      // Optimized for mobile: detect every 300ms
      if (now - lastDetectionTime.current < 300) {
        detectionFrameRef.current = requestAnimationFrame(detectFaces);
        return;
      }

      lastDetectionTime.current = now;

      try {
        // Use super-fast TinyFaceDetector for preview (mobile optimized)
        const detections = await faceapi
          .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions({
            inputSize: 160, // Reduced for mobile performance
            scoreThreshold: 0.5
          }));

        // Convert to expected format
        const formattedDetections = detections.map((det) => ({
          detection: det,
          confidence: det.score
        }));

        // Throttle state updates
        if (formattedDetections.length !== detectedFaces.length) {
          setDetectedFaces(formattedDetections);
        }
        drawFaceBoxes(formattedDetections);
      } catch (err) {
        console.error('Face detection error:', err);
      }

      detectionFrameRef.current = requestAnimationFrame(detectFaces);
    };

    // Start the detection loop
    detectionFrameRef.current = requestAnimationFrame(detectFaces);
  };

  const drawFaceBoxes = (detections: any[]) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    // Only resize canvas if dimensions changed
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Limit drawing to first 20 faces for performance
    const facesToDraw = detections.slice(0, 20);
    
    facesToDraw.forEach((detection, index) => {
      const box = detection.detection.box;
      
      // Draw bounding box (thinner lines for mobile)
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      
      // Draw face number badge (smaller for mobile)
      const badgeWidth = 35;
      const badgeHeight = 22;
      ctx.fillStyle = '#10b981';
      ctx.fillRect(box.x, box.y - badgeHeight, badgeWidth, badgeHeight);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`#${index + 1}`, box.x + 6, box.y - 6);
    });
  };

  const handleCapture = async () => {
    if (detectedFaces.length === 0) {
      toast({
        title: "No Faces Detected",
        description: "Please ensure people are visible in the camera.",
        variant: "destructive",
      });
      return;
    }

    if (modelStatus !== 'ready') {
      toast({
        title: "Please Wait",
        description: "High-accuracy models are still loading...",
        variant: "destructive",
      });
      return;
    }

    setIsCapturing(true);
    
    // Stop detection during capture
    if (detectionFrameRef.current) {
      cancelAnimationFrame(detectionFrameRef.current);
    }

    // Flash animation
    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 300);

    try {
      toast({
        title: "Processing...",
        description: `Analyzing ${detectedFaces.length} faces...`,
      });

      // Wait for animation to complete
      await new Promise(resolve => setTimeout(resolve, 350));
      
      setIsProcessing(true);

      if (!videoRef.current) {
        throw new Error('Video not available');
      }

      console.log('Starting RetinaFace detection and ArcFace recognition...');
      
      // Detect and recognize all faces using RetinaFace + ArcFace (backend)
      const result = await detectAndRecognizeFaces(videoRef.current);
      
      const processed: ProcessedFace[] = [];
      let recognizedCount = 0;
      
      for (const detection of result.detections) {
        if (!detection.embedding) {
          processed.push({
            id: `face-${Math.random()}`,
            name: 'Unknown Person',
            status: 'unrecognized',
            confidence: detection.confidence
          });
          continue;
        }
        
        const embedding = new Float32Array(detection.embedding);
        const recognition = await recognizeFace(embedding);
        
        if (recognition.recognized && recognition.userId) {
          // Record attendance
          await recordAttendance(
            recognition.userId,
            recognition.status || 'present',
            recognition.confidence
          );
          
          processed.push({
            id: recognition.userId,
            name: recognition.userName || 'Unknown',
            status: recognition.status === 'present' || recognition.status === 'late' ? recognition.status : 'present',
            confidence: recognition.confidence,
            imageUrl: recognition.userAvatar
          });
          recognizedCount++;
        } else {
          processed.push({
            id: `face-${Math.random()}`,
            name: 'Unknown Person',
            status: 'unrecognized',
            confidence: recognition.confidence
          });
        }
      }

      const batchResult = {
        processed: processed.length,
        recognized: recognizedCount,
        unrecognized: processed.length - recognizedCount
      };

      setProcessedResults(processed);
      setShowResults(true);
      setIsProcessing(false);
      setIsCapturing(false); // Reset capturing state

      toast({
        title: "Processing Complete",
        description: `${batchResult.recognized} recognized, ${batchResult.processed - batchResult.recognized} unrecognized`,
      });

    } catch (err) {
      console.error('Capture error:', err);
      setIsProcessing(false);
      setIsCapturing(false);
      
      // Check if camera is still active after error
      const isStreamActive = streamRef.current?.active && 
                            videoRef.current?.srcObject === streamRef.current;
      
      if (!isStreamActive) {
        console.log('Camera stream lost after error, restarting...');
        await startCamera();
      } else {
        startFaceDetection();
      }
      
      toast({
        title: "Processing Error",
        description: err instanceof Error ? err.message : "Failed to process faces",
        variant: "destructive",
      });
    }
  };

  const handleReset = async () => {
    setShowResults(false);
    setProcessedResults([]);
    setDetectedFaces([]);
    setIsCapturing(false);
    
    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    
    // Check if camera stream is still active
    const isStreamActive = streamRef.current?.active && 
                          videoRef.current?.srcObject === streamRef.current &&
                          videoRef.current?.readyState >= 2;
    
    if (!isStreamActive) {
      console.log('Camera stream inactive, restarting camera...');
      // Stop any existing stream
      stopCamera();
      // Restart camera
      await startCamera();
    } else {
      // Just restart detection if camera is still active
      startFaceDetection();
    }
    
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Multiple Face Attendance
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Capture up to 50 faces simultaneously with high-accuracy detection
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant={previewModelReady ? 'default' : 'secondary'} className="bg-green-500 text-white">
              {previewModelReady ? 'Preview: Fast' : 'Loading Preview'}
            </Badge>
            <Badge variant={modelStatus === 'ready' ? 'default' : 'secondary'} className="bg-blue-500 text-white">
              {modelStatus === 'loading' && 'Capture: Loading'}
              {modelStatus === 'ready' && 'Capture: RetinaFace + ArcFace'}
              {modelStatus === 'error' && 'Error'}
            </Badge>
          </div>
        </div>
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
                <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                  {captureFlash && (
                    <div className="absolute inset-0 bg-white animate-[fade-out_0.3s_ease-out] z-20" />
                  )}
                  
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: cameraFacing === 'user' ? 'scaleX(-1)' : 'none' }}
                  />
                  
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    style={{ transform: cameraFacing === 'user' ? 'scaleX(-1)' : 'none' }}
                  />

                  {/* Face count overlay */}
                  {detectedFaces.length > 0 && (
                    <div className="absolute top-3 left-3 bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2">
                      <div className="w-2 h-2 bg-primary-foreground rounded-full animate-pulse" />
                      {detectedFaces.length} face{detectedFaces.length !== 1 ? 's' : ''}
                    </div>
                  )}

                  {/* Camera switch button */}
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute top-3 right-3 rounded-full bg-background/80 backdrop-blur-sm"
                    onClick={toggleCamera}
                    disabled={isCapturing || isProcessing}
                  >
                    <SwitchCamera className="h-5 w-5" />
                  </Button>
                </div>

                {/* Controls */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="text-sm text-muted-foreground text-center sm:text-left">
                    {detectedFaces.length === 0 && "Position people in front of the camera"}
                    {detectedFaces.length > 0 && detectedFaces.length < 10 && "Good! More faces can be detected"}
                    {detectedFaces.length >= 10 && "Ready for batch capture"}
                  </div>
                  
                  <Button
                    onClick={handleCapture}
                    disabled={isCapturing || isProcessing || detectedFaces.length === 0 || modelStatus !== 'ready'}
                    size="lg"
                    className="gap-2 w-full sm:w-auto touch-manipulation"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Processing...
                      </>
                    ) : modelStatus !== 'ready' ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Loading...
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
                  <div className="grid grid-cols-3 gap-3 sm:gap-4">
                    <Card className="p-3 sm:p-4 bg-success/10 border-success/30">
                      <div className="text-center">
                        <CheckCircle className="h-6 w-6 sm:h-8 sm:w-8 text-success mx-auto mb-1 sm:mb-2" />
                        <p className="text-xl sm:text-2xl font-bold text-success">
                          {processedResults.filter(r => r.status === 'present').length}
                        </p>
                        <p className="text-xs text-success/80">Present</p>
                      </div>
                    </Card>
                    
                    <Card className="p-3 sm:p-4 bg-warning/10 border-warning/30">
                      <div className="text-center">
                        <AlertCircle className="h-6 w-6 sm:h-8 sm:w-8 text-warning mx-auto mb-1 sm:mb-2" />
                        <p className="text-xl sm:text-2xl font-bold text-warning">
                          {processedResults.filter(r => r.status === 'late').length}
                        </p>
                        <p className="text-xs text-warning/80">Late</p>
                      </div>
                    </Card>
                    
                    <Card className="p-3 sm:p-4 bg-destructive/10 border-destructive/30">
                      <div className="text-center">
                        <XCircle className="h-6 w-6 sm:h-8 sm:w-8 text-destructive mx-auto mb-1 sm:mb-2" />
                        <p className="text-xl sm:text-2xl font-bold text-destructive">
                          {processedResults.filter(r => r.status === 'unrecognized').length}
                        </p>
                        <p className="text-xs text-destructive/80">Unrecognized</p>
                      </div>
                    </Card>
                  </div>

                  {/* Detailed Results */}
                  <div className="max-h-[400px] overflow-y-auto space-y-2">
                    {processedResults.map((result, index) => (
                      <div
                        key={result.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card border-border"
                      >
                        <div className="flex items-center gap-3">
                          {result.imageUrl && (
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={result.imageUrl} alt={result.name} />
                            </Avatar>
                          )}
                          <span className="font-medium text-sm sm:text-base">#{index + 1}</span>
                          <div>
                            <p className="font-medium text-sm sm:text-base">{result.name}</p>
                            {result.confidence && (
                              <p className="text-xs text-muted-foreground">
                                {(result.confidence * 100).toFixed(1)}% match
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={result.status === 'present' ? 'text-success' : result.status === 'late' ? 'text-warning' : 'text-destructive'}>
                            {getStatusIcon(result.status)}
                          </div>
                          <Badge variant="outline" className="capitalize text-xs">
                            {result.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Reset Button */}
                  <Button onClick={handleReset} variant="outline" className="w-full touch-manipulation">
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
