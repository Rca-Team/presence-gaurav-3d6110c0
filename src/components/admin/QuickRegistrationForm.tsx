import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Camera, Loader2, CheckCircle, User, Upload } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { registerFace } from '@/services/face-recognition/RegistrationService';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Category = 'A' | 'B' | 'C' | 'D' | 'Teacher';

interface QuickRegistrationFormProps {
  onSuccess?: () => void;
  prefillData?: {
    name?: string;
    employee_id?: string;
    department?: string;
    position?: string;
    category?: Category;
    imageBlob?: Blob;
  };
}

const QuickRegistrationForm: React.FC<QuickRegistrationFormProps> = ({ onSuccess, prefillData }) => {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [formData, setFormData] = useState({
    name: prefillData?.name || '',
    employee_id: prefillData?.employee_id || '',
    department: prefillData?.department || '',
    position: prefillData?.position || '',
    category: prefillData?.category || 'A' as Category
  });
  
  const [capturedImage, setCapturedImage] = useState<Blob | null>(prefillData?.imageBlob || null);
  const [capturedImageUrl, setCapturedImageUrl] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);

  // Load models on mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        ]);
        setModelsReady(true);
        console.log('Registration models loaded');
      } catch (err) {
        console.error('Error loading models:', err);
      }
    };
    loadModels();
    
    return () => stopCamera();
  }, []);

  // Handle prefill data
  useEffect(() => {
    if (prefillData) {
      setFormData({
        name: prefillData.name || '',
        employee_id: prefillData.employee_id || '',
        department: prefillData.department || '',
        position: prefillData.position || '',
        category: prefillData.category || 'A'
      });
      if (prefillData.imageBlob) {
        setCapturedImage(prefillData.imageBlob);
        setCapturedImageUrl(URL.createObjectURL(prefillData.imageBlob));
      }
    }
  }, [prefillData]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraActive(true);
        
        // Start face detection loop
        detectFaceLoop();
      }
    } catch (err) {
      toast({
        title: "Camera Error",
        description: "Unable to access camera",
        variant: "destructive"
      });
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
    setFaceDetected(false);
  };

  const detectFaceLoop = async () => {
    if (!videoRef.current || !modelsReady) return;
    
    const detect = async () => {
      if (!videoRef.current || !streamRef.current?.active) return;
      
      try {
        const detection = await faceapi.detectSingleFace(
          videoRef.current,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 })
        );
        setFaceDetected(!!detection);
      } catch (err) {
        // Silent error
      }
      
      if (streamRef.current?.active) {
        requestAnimationFrame(detect);
      }
    };
    
    detect();
  };

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Mirror the image for selfie camera
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob((blob) => {
      if (blob) {
        setCapturedImage(blob);
        setCapturedImageUrl(URL.createObjectURL(blob));
        stopCamera();
      }
    }, 'image/jpeg', 0.9);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCapturedImage(file);
      setCapturedImageUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!capturedImage) {
      toast({ title: "Error", description: "Please capture or upload a photo", variant: "destructive" });
      return;
    }
    
    if (!formData.name.trim()) {
      toast({ title: "Error", description: "Please enter a name", variant: "destructive" });
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // Get face descriptor from captured image using SSD MobileNet for accuracy
      const img = new Image();
      img.src = capturedImageUrl;
      await new Promise(resolve => { img.onload = resolve; });
      
      let descriptor: Float32Array | undefined;
      
      if (modelsReady) {
        // Use SSD MobileNet for more accurate face detection during registration
        const detection = await faceapi
          .detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        
        if (detection) {
          descriptor = detection.descriptor;
          console.log('Face descriptor extracted successfully');
        } else {
          // Fallback to TinyFaceDetector
          const tinyDetection = await faceapi
            .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
          
          if (tinyDetection) {
            descriptor = tinyDetection.descriptor;
            console.log('Face descriptor extracted with fallback detector');
          }
        }
        
        if (!descriptor) {
          toast({ title: "Warning", description: "No face detected in the image. Try a clearer photo.", variant: "destructive" });
          setIsProcessing(false);
          return;
        }
      }
      
      await registerFace(
        capturedImage,
        formData.name,
        formData.employee_id || `STU-${Date.now()}`,
        formData.department || 'General',
        formData.position || 'Student',
        undefined,
        descriptor,
        undefined,
        formData.category
      );
      
      toast({
        title: "Registration Successful",
        description: `${formData.name} has been registered`,
      });
      
      // Reset form
      setFormData({ name: '', employee_id: '', department: '', position: '', category: 'A' });
      setCapturedImage(null);
      setCapturedImageUrl('');
      
      onSuccess?.();
    } catch (err) {
      console.error('Registration error:', err);
      toast({
        title: "Registration Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <User className="h-5 w-5" />
          Quick Registration
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Photo Capture Section */}
          <div className="space-y-2">
            <Label>Photo</Label>
            <div className="relative aspect-video bg-muted rounded-lg overflow-hidden max-w-sm">
              {isCameraActive ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                  <div className={`absolute inset-0 border-4 rounded-lg transition-colors ${faceDetected ? 'border-green-500' : 'border-yellow-500'}`} />
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
                    <Button
                      type="button"
                      onClick={capturePhoto}
                      disabled={!faceDetected}
                      className="bg-white text-black hover:bg-gray-100"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      {faceDetected ? 'Capture' : 'Position Face'}
                    </Button>
                  </div>
                </>
              ) : capturedImageUrl ? (
                <div className="relative">
                  <img src={capturedImageUrl} alt="Captured" className="w-full h-full object-cover" />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="absolute bottom-2 right-2"
                    onClick={() => {
                      setCapturedImage(null);
                      setCapturedImageUrl('');
                    }}
                  >
                    Retake
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
                  <Button type="button" onClick={startCamera} variant="outline">
                    <Camera className="h-4 w-4 mr-2" />
                    Open Camera
                  </Button>
                  <span className="text-sm text-muted-foreground">or</span>
                  <label className="cursor-pointer">
                    <Input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <Button type="button" variant="outline" asChild>
                      <span>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Photo
                      </span>
                    </Button>
                  </label>
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Form Fields - Compact Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter full name"
                required
              />
            </div>
            <div>
              <Label htmlFor="employee_id">Student ID</Label>
              <Input
                id="employee_id"
                value={formData.employee_id}
                onChange={(e) => setFormData(prev => ({ ...prev, employee_id: e.target.value }))}
                placeholder="Auto-generated"
              />
            </div>
            <div>
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={formData.department}
                onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                placeholder="e.g. Computer Science"
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="category">Category *</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value: Category) => setFormData(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Category A</SelectItem>
                  <SelectItem value="B">Category B</SelectItem>
                  <SelectItem value="C">Category C</SelectItem>
                  <SelectItem value="D">Category D</SelectItem>
                  <SelectItem value="Teacher">Teacher</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isProcessing || !capturedImage}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Registering...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Register Face
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default QuickRegistrationForm;
