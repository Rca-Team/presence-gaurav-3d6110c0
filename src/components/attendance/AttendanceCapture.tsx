
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

const AttendanceCapture = () => {
  const { toast } = useToast();
  const webcamRef = useRef<HTMLVideoElement>(null);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<{
    accessible: boolean;
    errors: string[];
  } | null>(null);
  const [enhancementEnabled, setEnhancementEnabled] = useState(true);
  const [isEnhancing, setIsEnhancing] = useState(false);
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
      console.log('Processing face recognition...');
      console.log('Webcam video element:', webcamRef.current);
      console.log('Video element ready state:', webcamRef.current.readyState);
      console.log('Video dimensions:', webcamRef.current.videoWidth, 'x', webcamRef.current.videoHeight);
      
      // Apply video enhancement if enabled
      let videoElement = webcamRef.current;
      if (enhancementEnabled && videoEnhancementService.isEnhancementAvailable()) {
        setIsEnhancing(true);
        try {
          const enhancedCanvas = await videoEnhancementService.enhanceVideoFrame(webcamRef.current);
          // Create a video element from the enhanced canvas
          const enhancedVideo = document.createElement('video');
          enhancedVideo.srcObject = enhancedCanvas.captureStream();
          enhancedVideo.play();
          console.log('Video frame enhanced for better recognition');
        } catch (enhanceError) {
          console.warn('Enhancement failed, using original video:', enhanceError);
        } finally {
          setIsEnhancing(false);
        }
      }
      
      const recognitionResult = await processFace(videoElement, {
        enableMultipleFaces: false,
        enableTracking: true
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
          
          // Capture image for recognized faces too
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          let imageUrl = '';
          if (ctx && webcamRef.current) {
            canvas.width = webcamRef.current.videoWidth;
            canvas.height = webcamRef.current.videoHeight;
            ctx.drawImage(webcamRef.current, 0, 0);
            imageUrl = canvas.toDataURL('image/jpeg');
          }
          
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
          // Capture the unrecognized face image
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx && webcamRef.current) {
            canvas.width = webcamRef.current.videoWidth;
            canvas.height = webcamRef.current.videoHeight;
            ctx.drawImage(webcamRef.current, 0, 0);
            const imageUrl = canvas.toDataURL('image/jpeg');
            
            setUnrecognizedAlert({
              imageUrl,
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
          <Webcam
            ref={webcamRef}
            onCapture={() => handleCapture()}
            className="w-full"
            showControls={!isProcessing && !result}
            autoStart={!result}
          />
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
        
        {result && <AttendanceResult result={result} resetResult={resetResult} />}
      </div>
    </Card>
  );
};

export default AttendanceCapture;
