import React, { useRef, useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Camera, Users, CheckCircle, XCircle, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { resetMultipleFaceTracking } from '@/services/face-recognition/MultipleFaceService';
import { supabase } from '@/integrations/supabase/client';
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

        // Step 2: Load MTCNN for high-accuracy multiple face processing
        setTimeout(async () => {
          if (!isMounted) return;
          
          console.log('Loading MTCNN for high-accuracy multiple face processing...');
          await faceapi.nets.mtcnn.loadFromUri('/models');
          await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
          await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
          
          if (isMounted) {
            setModelStatus('ready');
            console.log('High-accuracy models ready');
            
            toast({
              title: "High-Accuracy Ready",
              description: "MTCNN loaded for capture",
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
    if (detectionFrameRef.current) {
      cancelAnimationFrame(detectionFrameRef.current);
    }

    const detectFaces = async () => {
      if (!videoRef.current || !canvasRef.current || isCapturing || isProcessing || showResults) {
        detectionFrameRef.current = requestAnimationFrame(detectFaces);
        return;
      }

      const now = performance.now();
      // Fast preview: detect every 200ms with TinyFaceDetector
      if (now - lastDetectionTime.current < 200) {
        detectionFrameRef.current = requestAnimationFrame(detectFaces);
        return;
      }

      lastDetectionTime.current = now;

      try {
        // Use super-fast TinyFaceDetector for preview
        const detections = await faceapi
          .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions({
            inputSize: 224, // Smaller for speed
            scoreThreshold: 0.5
          }));

        // Convert to expected format
        const formattedDetections = detections.map((det) => ({
          detection: det,
          confidence: det.score
        }));

        setDetectedFaces(formattedDetections);
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
        title: "Capturing with High Accuracy",
        description: `Using MTCNN to process ${detectedFaces.length} faces...`,
      });

      // Wait for animation
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setIsProcessing(true);

      // Detect and recognize all faces with SSD MobileNet (high accuracy)
      if (!videoRef.current) {
        throw new Error('Video not available');
      }

      console.log('Using MTCNN for high-accuracy detection...');
      
      // Use MTCNN for high accuracy multiple face detection
      const detections = await faceapi
        .detectAllFaces(videoRef.current, new faceapi.MtcnnOptions({ minFaceSize: 20 }))
        .withFaceLandmarks()
        .withFaceDescriptors();
      
      console.log(`MTCNN detected ${detections.length} faces`);
      
      // Get all registered faces for comparison
      const { data: registeredFaces } = await supabase
        .from('attendance_records')
        .select('id, face_descriptor, device_info, image_url')
        .filter('device_info->registration', 'eq', 'true');
      
      console.log(`Found ${registeredFaces?.length || 0} registered faces`);
      
      const processedFaces = [];
      
      for (const detection of detections) {
        let bestMatch = null;
        let bestDistance = 0.6; // Threshold
        
        // Compare with registered faces
        if (registeredFaces && registeredFaces.length > 0) {
          for (const registered of registeredFaces) {
            if (registered.face_descriptor) {
              const descriptorArray = JSON.parse(registered.face_descriptor);
              const registeredDescriptor = new Float32Array(descriptorArray);
              const distance = faceapi.euclideanDistance(detection.descriptor, registeredDescriptor);
              
              if (distance < bestDistance) {
                bestDistance = distance;
                const deviceInfo = registered.device_info as any;
                const metadata = deviceInfo?.metadata || {};
                bestMatch = {
                  id: registered.id,
                  name: metadata.name || 'Unknown',
                  firebase_image_url: metadata.firebase_image_url || registered.image_url
                };
              }
            }
          }
        }
        
        processedFaces.push({
          detection: detection.detection,
          recognition: bestMatch ? {
            recognized: true,
            employee: {
              name: bestMatch.name || 'Unknown',
              firebase_image_url: bestMatch.firebase_image_url
            },
            confidence: 1 - bestDistance
          } : null,
          confidence: detection.detection.score,
          id: Math.random().toString(36).substr(2, 9)
        });
      }
      
      const result = { faces: processedFaces };

      // Process the results and save to database
      const processed: ProcessedFace[] = [];
      let recognizedCount = 0;
      
      for (const face of result.faces) {
        if (face.recognition?.recognized && face.recognition.employee) {
          // Save attendance record
          await supabase.from('attendance_records').insert({
            user_id: face.recognition.employee.id,
            status: 'present',
            confidence_score: face.recognition.confidence,
            device_info: JSON.stringify({
              name: face.recognition.employee.name,
              metadata: { name: face.recognition.employee.name }
            }),
            image_url: face.recognition.employee.firebase_image_url
          });
          
          processed.push({
            id: face.id,
            name: face.recognition.employee.name,
            status: 'present',
            confidence: face.recognition.confidence,
            imageUrl: face.recognition.employee.firebase_image_url
          });
          recognizedCount++;
        } else {
          processed.push({
            id: face.id,
            name: 'Unknown Person',
            status: 'unrecognized',
            confidence: face.confidence
          });
        }
      }
      
      const batchResult = {
        processed: processed.length,
        recognized: recognizedCount
      };

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
    resetMultipleFaceTracking();
    
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
              {modelStatus === 'ready' && 'Capture: MTCNN'}
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
                    disabled={isCapturing || isProcessing || detectedFaces.length === 0 || modelStatus !== 'ready'}
                    size="lg"
                    className="gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        High-Accuracy Processing...
                      </>
                    ) : modelStatus !== 'ready' ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Loading MTCNN...
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
                    <Card className="p-4 bg-primary/10 border-primary/20">
                      <div className="text-center">
                        <CheckCircle className="h-8 w-8 text-primary mx-auto mb-2" />
                        <p className="text-2xl font-bold text-primary">
                          {processedResults.filter(r => r.status === 'present').length}
                        </p>
                        <p className="text-xs text-muted-foreground">Present</p>
                      </div>
                    </Card>
                    
                    <Card className="p-4 bg-yellow-500/10 border-yellow-500/20">
                      <div className="text-center">
                        <AlertCircle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-yellow-500">
                          {processedResults.filter(r => r.status === 'late').length}
                        </p>
                        <p className="text-xs text-muted-foreground">Late</p>
                      </div>
                    </Card>
                    
                    <Card className="p-4 bg-destructive/10 border-destructive/20">
                      <div className="text-center">
                        <XCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
                        <p className="text-2xl font-bold text-destructive">
                          {processedResults.filter(r => r.status === 'unrecognized').length}
                        </p>
                        <p className="text-xs text-muted-foreground">Unrecognized</p>
                      </div>
                    </Card>
                  </div>

                  {/* Detailed Results */}
                  <div className="max-h-[400px] overflow-y-auto space-y-2">
                    {processedResults.map((result, index) => (
                      <div
                        key={result.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-card border border-border hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-muted-foreground font-medium text-sm">
                            #{index + 1}
                          </div>
                          {result.imageUrl && (
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={result.imageUrl} alt={result.name} />
                              <AvatarFallback>{result.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                          )}
                          <div>
                            <p className="font-medium text-foreground">{result.name}</p>
                            {result.confidence && (
                              <p className="text-xs text-muted-foreground">
                                Confidence: {(result.confidence * 100).toFixed(1)}%
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(result.status)}
                          <Badge 
                            variant={result.status === 'present' ? 'default' : result.status === 'late' ? 'secondary' : 'destructive'}
                            className="capitalize"
                          >
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
