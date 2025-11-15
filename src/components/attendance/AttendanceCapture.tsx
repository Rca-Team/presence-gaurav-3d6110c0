
import React, { useRef, useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Card } from '@/components/ui/card';
import { Webcam } from '@/components/ui/webcam';
import { Button } from '@/components/ui/button';
import { useOptimizedFaceRecognition } from '@/hooks/useOptimizedFaceRecognition';
import AttendanceResult from './AttendanceResult';
import UnrecognizedFaceAlert from './UnrecognizedFaceAlert';
import RecognizedFaceAlert from './RecognizedFaceAlert';
import { loadOptimizedModels } from '@/services/face-recognition/OptimizedModelService';
import { videoEnhancementService } from '@/services/ai/VideoEnhancementService';
import { AlertCircle, Sparkles } from 'lucide-react';
import * as faceapi from 'face-api.js';

const AttendanceCapture = () => {
  const { toast } = useToast();
  const webcamRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<{
    accessible: boolean;
    errors: string[];
  } | null>(null);
  const [enhancementEnabled, setEnhancementEnabled] = useState(true);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [detectedFaces, setDetectedFaces] = useState<any[]>([]);
  const detectionIntervalRef = useRef<number>();
  const [unrecognizedAlert, setUnrecognizedAlert] = useState<{
    imageUrl: string;
    timestamp: Date;
  } | null>(null);
  
  const [recognizedAlert, setRecognizedAlert] = useState<{
    employee: any;
    status: 'present' | 'late';
    timestamp: Date;
    imageUrl?: string;
  } | null>(null);
  
  const {
    processFace,
    isProcessing,
    isModelLoading,
    result,
    error,
    resetProcessing: resetResult
  } = useOptimizedFaceRecognition();

  // Wrapper to reset all state including captured image and detected faces
  const handleReset = () => {
    resetResult();
    setCapturedImage(null);
    setDetectedFaces([]);
  };
  
  // Initial model availability check with cleanup and debouncing
  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;
    
    const checkModelStatus = async () => {
      // Debounce model loading attempts
      if (timeoutId) clearTimeout(timeoutId);
      
      timeoutId = setTimeout(async () => {
        if (!isMounted) return;
        
        try {
          await loadOptimizedModels();
          if (isMounted) {
            setModelStatus('ready');
            
            // Initialize video enhancement service only once
            if (enhancementEnabled && !videoEnhancementService.isEnhancementAvailable()) {
              try {
                await videoEnhancementService.initialize();
              } catch (enhanceError) {
                console.warn('Video enhancement initialization failed:', enhanceError);
                // Continue without enhancement
              }
            }
          }
        } catch (err) {
          console.error('Error checking model status:', err);
          if (isMounted) {
            setModelStatus('error');
          }
        }
      }, 1000); // 1 second debounce
    };
    
    // Only check if models are not already loaded and component is loading
    if (isModelLoading && modelStatus !== 'ready') {
      checkModelStatus();
    } else if (!isModelLoading) {
      setModelStatus('ready');
    }
    
    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isModelLoading, enhancementEnabled, modelStatus]);

  // Real-time face detection overlay
  useEffect(() => {
    const runFaceDetection = async () => {
      if (!webcamRef.current || isProcessing || result || capturedImage) return;

      const video = webcamRef.current;
      if (video.readyState !== 4) return;

      try {
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
          .withFaceLandmarks(true);

        setDetectedFaces(detections);

        // Draw on overlay canvas
        if (overlayCanvasRef.current && detections.length > 0) {
          const canvas = overlayCanvasRef.current;
          const displaySize = { width: video.videoWidth, height: video.videoHeight };
          faceapi.matchDimensions(canvas, displaySize);

          const resizedDetections = faceapi.resizeResults(detections, displaySize);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw bounding boxes with modern design
            resizedDetections.forEach((detection) => {
              const box = detection.detection.box;
              
              // Main box
              ctx.strokeStyle = '#10b981';
              ctx.lineWidth = 3;
              ctx.strokeRect(box.x, box.y, box.width, box.height);
              
              // Corner accents
              const cornerSize = 20;
              ctx.strokeStyle = '#10b981';
              ctx.lineWidth = 4;
              
              // Draw corners
              [
                [[box.x, box.y + cornerSize], [box.x, box.y], [box.x + cornerSize, box.y]],
                [[box.x + box.width - cornerSize, box.y], [box.x + box.width, box.y], [box.x + box.width, box.y + cornerSize]],
                [[box.x, box.y + box.height - cornerSize], [box.x, box.y + box.height], [box.x + cornerSize, box.y + box.height]],
                [[box.x + box.width - cornerSize, box.y + box.height], [box.x + box.width, box.y + box.height], [box.x + box.width, box.y + box.height - cornerSize]]
              ].forEach(corner => {
                ctx.beginPath();
                ctx.moveTo(corner[0][0], corner[0][1]);
                ctx.lineTo(corner[1][0], corner[1][1]);
                ctx.lineTo(corner[2][0], corner[2][1]);
                ctx.stroke();
              });
            });
          }
        } else if (overlayCanvasRef.current) {
          const ctx = overlayCanvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
          }
        }
      } catch (error) {
        console.error('Face detection error:', error);
      }
    };

    if (!result && !isProcessing && !capturedImage && modelStatus === 'ready') {
      detectionIntervalRef.current = window.setInterval(runFaceDetection, 300);
    }

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, [isProcessing, result, capturedImage, modelStatus]);
  
  const runDiagnostics = async () => {
    setShowDiagnostics(true);
    try {
      await loadOptimizedModels();
      setDiagnosticResult({
        accessible: true,
        errors: []
      });
    } catch (err) {
      console.error('Error running diagnostics:', err);
      setDiagnosticResult({
        accessible: false,
        errors: [`Diagnostic error: ${err instanceof Error ? err.message : String(err)}`]
      });
    }
  };
  
  const retryModels = async () => {
    setModelStatus('loading');
    setShowDiagnostics(false);
    setDiagnosticResult(null);
    
    try {
      await loadOptimizedModels();
      setModelStatus('ready');
      toast({
        title: "Success",
        description: "Face recognition models loaded successfully.",
        variant: "default",
      });
    } catch (err) {
      console.error('Error reloading models:', err);
      setModelStatus('error');
      toast({
        title: "Error",
        description: "Failed to reload face models. Please refresh the page.",
        variant: "destructive",
      });
    }
  };
  
  const handleCapture = async () => {
    if (!webcamRef.current || isProcessing || isModelLoading) {
      console.log('Cannot capture: webcam not ready, processing in progress, or models still loading');
      console.log('Webcam ref exists:', !!webcamRef.current);
      console.log('Is processing:', isProcessing);
      console.log('Is model loading:', isModelLoading);
      return;
    }
    
    try {
      // Trigger flash animation
      setCaptureFlash(true);
      setTimeout(() => setCaptureFlash(false), 300);
      
      console.log('Capturing instant image...');
      
      // Capture instant image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }
      
      canvas.width = webcamRef.current.videoWidth;
      canvas.height = webcamRef.current.videoHeight;
      ctx.drawImage(webcamRef.current, 0, 0);
      
      // Apply video enhancement if enabled
      let imageToProcess = canvas;
      if (enhancementEnabled && videoEnhancementService.isEnhancementAvailable()) {
        setIsEnhancing(true);
        try {
          console.log('Enhancing captured image for better recognition...');
          const enhancedCanvas = await videoEnhancementService.enhanceVideoFrame(webcamRef.current);
          imageToProcess = enhancedCanvas;
        } catch (enhanceError) {
          console.warn('Enhancement failed, using original image:', enhanceError);
        } finally {
          setIsEnhancing(false);
        }
      }
      
      const imageDataUrl = imageToProcess.toDataURL('image/jpeg', 0.95);
      setCapturedImage(imageDataUrl);
      
      // Create an image element from the captured data
      const img = new Image();
      img.src = imageDataUrl;
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
      });
      
      console.log('Processing captured image...');
      console.log('Image dimensions:', img.width, 'x', img.height);
      
      const recognitionResult = await processFace(img, {
        enableMultipleFaces: false,
        enableTracking: false
      });
      
      if (!recognitionResult) {
        toast({
          title: "Processing Error",
          description: error || "Failed to process face. Please try again.",
          variant: "destructive",
        });
        return;
      }
      
      // Handle single face result
      if (recognitionResult.type === 'single' && recognitionResult.single) {
        const single = recognitionResult.single;
        
        if (single.recognized && single.employee) {
          const displayStatus = single.status === 'present' ? 'present' : single.status === 'late' ? 'late' : 'unauthorized';
          
          // Use the captured image
          const imageUrl = capturedImage || '';
          
          // Show popup for present and late status
          if (displayStatus === 'present' || displayStatus === 'late') {
            setRecognizedAlert({
              employee: single.employee,
              status: displayStatus,
              timestamp: new Date(),
              imageUrl: imageUrl
            });
          }
          
          const statusMessage = displayStatus === 'present' ? 'present' : displayStatus === 'late' ? 'late' : 'not authorized';
          
          toast({
            title: "Attendance Recorded",
            description: `${single.employee.name} marked as ${statusMessage} at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            variant: displayStatus === 'present' ? "default" : displayStatus === 'late' ? "default" : "destructive",
          });
        } else {
          // Unrecognized face - use captured image
          if (capturedImage) {
            setUnrecognizedAlert({
              imageUrl: capturedImage,
              timestamp: new Date()
            });
          }
          
          toast({
            title: "Face Not Recognized",
            description: "This person is not registered in the system. Security alert has been triggered.",
            variant: "destructive",
          });
        }
      }
    } catch (err) {
      console.error('Face recognition error:', err);
      toast({
        title: "Processing Error",
        description: "An error occurred while processing the image.",
        variant: "destructive",
      });
    }
  };
  
  return (
    <Card className="p-4 sm:p-6">
      <h3 className="text-lg font-medium mb-4">Facial Recognition</h3>
        <div className="space-y-4">
        {/* Video Enhancement Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-muted rounded-lg">
          <div className="flex items-center space-x-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">AI Video Enhancement</span>
            {videoEnhancementService.isEnhancementAvailable() && (
              <span className="text-xs text-green-600">Available</span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEnhancementEnabled(!enhancementEnabled)}
              disabled={isProcessing || isEnhancing}
              className="text-xs sm:text-sm"
            >
              {enhancementEnabled ? 'Disable' : 'Enable'} Enhancement
            </Button>
            {isEnhancing && (
              <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
            )}
          </div>
        </div>

        {/* Recognized Face Alert */}
        {recognizedAlert && (
          <RecognizedFaceAlert
            employee={recognizedAlert.employee}
            status={recognizedAlert.status}
            timestamp={recognizedAlert.timestamp}
            imageUrl={recognizedAlert.imageUrl}
            onDismiss={() => setRecognizedAlert(null)}
          />
        )}

        {/* Unrecognized Face Alert */}
        {unrecognizedAlert && (
          <UnrecognizedFaceAlert
            imageUrl={unrecognizedAlert.imageUrl}
            timestamp={unrecognizedAlert.timestamp}
            onRetry={() => {
              setUnrecognizedAlert(null);
              handleCapture();
            }}
            onRegister={() => {
              setUnrecognizedAlert(null);
              // Navigate to registration page
              window.location.href = '/register';
            }}
          />
        )}

        {modelStatus === 'error' ? (
          <div className="bg-destructive/10 border border-destructive rounded-md p-4 space-y-3">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-destructive mr-2" />
              <h4 className="font-medium text-destructive">Face Recognition Models Not Loaded</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              The application failed to load face recognition models. This might be due to network issues or missing model files.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={retryModels}
              >
                Retry Loading
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={runDiagnostics}
              >
                Run Diagnostics
              </Button>
            </div>
            
            {showDiagnostics && (
              <div className="bg-muted p-3 rounded-md text-sm space-y-2 max-h-48 overflow-y-auto">
                <h5 className="font-medium">Diagnostic Results:</h5>
                {!diagnosticResult ? (
                  <p>Running diagnostics...</p>
                ) : (
                  <>
                    <p className={diagnosticResult.accessible ? "text-green-600" : "text-destructive"}>
                      Models accessible: {diagnosticResult.accessible ? "Yes" : "No"}
                    </p>
                    {diagnosticResult.errors.length > 0 && (
                      <div>
                        <p className="font-medium">Errors:</p>
                        <ul className="list-disc pl-5 space-y-1">
                          {diagnosticResult.errors.map((err, i) => (
                            <li key={i} className="text-xs">{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="relative">
            {/* Flash animation overlay */}
            {captureFlash && (
              <div className="absolute inset-0 bg-white animate-[fade-out_0.3s_ease-out] z-10 pointer-events-none" />
            )}
            
            {/* Captured image preview during processing */}
            {capturedImage && isProcessing && (
              <div className="absolute inset-0 z-20 bg-background/95 flex items-center justify-center animate-fade-in">
                <div className="text-center space-y-4">
                  <img 
                    src={capturedImage} 
                    alt="Captured" 
                    className="max-w-full max-h-[300px] rounded-lg shadow-lg animate-scale-in"
                  />
                  <div className="flex items-center justify-center space-x-2">
                    <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                    <p className="text-muted-foreground">Processing captured image...</p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="relative">
              <Webcam
                ref={webcamRef}
                onCapture={() => handleCapture()}
                className="w-full"
                showControls={!isProcessing && !result}
                autoStart={!result}
                enhancementEnabled={enhancementEnabled}
              />
              
              {/* Face detection overlay canvas */}
              <canvas
                ref={overlayCanvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ zIndex: 5 }}
              />
              
              {/* Face detection indicator */}
              {detectedFaces.length > 0 && !capturedImage && (
                <div className="absolute top-4 left-4 bg-green-500/90 text-white px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 animate-fade-in" style={{ zIndex: 6 }}>
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  {detectedFaces.length} face{detectedFaces.length > 1 ? 's' : ''} detected
                </div>
              )}
            </div>
          </div>
        )}
        
        {isModelLoading && (
          <div className="flex flex-col items-center py-4">
            <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin mb-2"></div>
            <p className="text-muted-foreground">Loading face recognition models...</p>
          </div>
        )}
        
        {isProcessing && (
          <div className="flex flex-col items-center py-4">
            <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin mb-2"></div>
            <p className="text-muted-foreground">Processing face recognition...</p>
          </div>
        )}
        
        {result && <AttendanceResult result={result} resetResult={handleReset} />}
      </div>
    </Card>
  );
};

export default AttendanceCapture;
