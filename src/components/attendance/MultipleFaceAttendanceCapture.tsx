import React, { useRef, useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Camera, Users, CheckCircle, XCircle, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { loadOptimizedModels, detectFacesOptimized } from '@/services/face-recognition/OptimizedModelService';
import { detectMultipleFaces, processBatchAttendance, resetMultipleFaceTracking } from '@/services/face-recognition/MultipleFaceService';
import { videoEnhancementService } from '@/services/ai/VideoEnhancementService';
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
  const [videoEnhanced, setVideoEnhanced] = useState(false);
  const detectionIntervalRef = useRef<number>();
  const streamRef = useRef<MediaStream | null>(null);

  // Load models and start camera
  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        // Load models and video enhancement in parallel
        await Promise.all([
          loadOptimizedModels(),
          videoEnhancementService.initialize()
        ]);
        
        if (isMounted) {
          setModelStatus('ready');
          setVideoEnhanced(true);
          await startCamera();
          
          toast({
            title: "High-Accuracy Models Loaded",
            description: "Using SSD MobileNetV1 for better detection accuracy",
            duration: 3000,
          });
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
        // Use optimized detection with frame skipping and lower face count for preview
        const detections = await detectFacesOptimized(videoRef.current, {
          maxFaces: 20, // Limit preview to 20 faces for better performance
          classroomMode: false, // Disable classroom mode for preview
          skipFrames: true, // Enable frame skipping for better performance
          scoreThreshold: 0.6 // Stricter threshold for better accuracy
        });

        setDetectedFaces(detections);
        drawFaceBoxes(detections);
      } catch (err) {
        console.error('Face detection error:', err);
      }
    };

    // Detect faces every 1000ms (1 second) to reduce lag
    detectionIntervalRef.current = window.setInterval(detectFaces, 1000);
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

  const handleCapture = async () => {
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

      // Detect and recognize all faces
      if (!videoRef.current) {
        throw new Error('Video not available');
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
            <Badge variant="outline" className="bg-primary/10">
              SSD MobileNet
            </Badge>
            <Badge variant={modelStatus === 'ready' ? 'default' : 'secondary'}>
              {modelStatus === 'loading' && 'Loading...'}
              {modelStatus === 'ready' && 'Ready'}
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
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {detectedFaces.length === 0 && "Position people in front of the camera"}
                    {detectedFaces.length > 0 && detectedFaces.length < 10 && "Good! More faces can be detected"}
                    {detectedFaces.length >= 10 && "Ready for batch capture"}
                  </div>
                  
                  <Button
                    onClick={handleCapture}
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
