import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { FileUp, Loader2, Users, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { registerFace } from '@/services/face-recognition/RegistrationService';
import * as faceapi from 'face-api.js';

interface ExtractedUser {
  name: string;
  employee_id: string;
  department?: string;
  position?: string;
  imageUrl?: string;
  imageBlob?: Blob;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

const PDFBulkRegistration: React.FC = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isExtracting, setIsExtracting] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [extractedUsers, setExtractedUsers] = useState<ExtractedUser[]>([]);
  const [progress, setProgress] = useState(0);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // Load face-api models
  const loadModels = async () => {
    if (modelsLoaded) return;
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models')
      ]);
      setModelsLoaded(true);
    } catch (err) {
      console.error('Error loading models:', err);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.type.includes('pdf') && !file.type.includes('image')) {
      toast({
        title: "Invalid File",
        description: "Please upload a PDF document or image file",
        variant: "destructive"
      });
      return;
    }

    setIsExtracting(true);
    setExtractedUsers([]);
    setProgress(0);

    try {
      // Convert file to base64
      const base64 = await fileToBase64(file);
      
      toast({
        title: "Processing Document",
        description: "Using AI to extract user information...",
      });

      // Call AI edge function to extract data
      const { data, error } = await supabase.functions.invoke('extract-pdf-users', {
        body: { 
          fileData: base64,
          fileName: file.name,
          fileType: file.type
        }
      });

      if (error) throw error;

      if (data?.users && data.users.length > 0) {
        const users: ExtractedUser[] = data.users.map((user: any) => ({
          name: user.name || 'Unknown',
          employee_id: user.employee_id || user.student_id || `STU-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          department: user.department || user.class || '',
          position: user.position || user.grade || 'Student',
          imageUrl: user.photo_url || user.image_url,
          status: 'pending' as const
        }));

        setExtractedUsers(users);
        
        // Try to fetch images if URLs provided
        await fetchUserImages(users);
        
        toast({
          title: "Extraction Complete",
          description: `Found ${users.length} users in the document`,
        });
      } else {
        toast({
          title: "No Users Found",
          description: "Could not extract user information from the document",
          variant: "destructive"
        });
      }
    } catch (err) {
      console.error('Extraction error:', err);
      toast({
        title: "Extraction Failed",
        description: err instanceof Error ? err.message : "Failed to process document",
        variant: "destructive"
      });
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const fetchUserImages = async (users: ExtractedUser[]) => {
    const updatedUsers = [...users];
    
    for (let i = 0; i < updatedUsers.length; i++) {
      if (updatedUsers[i].imageUrl) {
        try {
          const response = await fetch(updatedUsers[i].imageUrl!);
          if (response.ok) {
            const blob = await response.blob();
            updatedUsers[i].imageBlob = blob;
          }
        } catch (err) {
          console.warn(`Failed to fetch image for ${updatedUsers[i].name}`);
        }
      }
    }
    
    setExtractedUsers(updatedUsers);
  };

  const handleRegisterAll = async () => {
    if (extractedUsers.length === 0) return;
    
    await loadModels();
    setIsRegistering(true);
    setProgress(0);

    const total = extractedUsers.length;
    let completed = 0;
    let successCount = 0;

    for (let i = 0; i < extractedUsers.length; i++) {
      const user = extractedUsers[i];
      
      setExtractedUsers(prev => prev.map((u, idx) => 
        idx === i ? { ...u, status: 'processing' } : u
      ));

      try {
        // Check if we have an image
        if (!user.imageBlob) {
          throw new Error('No image available');
        }

        // Get face descriptor
        let descriptor: Float32Array | undefined;
        
        if (modelsLoaded) {
          const img = new Image();
          img.src = URL.createObjectURL(user.imageBlob);
          await new Promise(resolve => { img.onload = resolve; });
          
          const detection = await faceapi
            .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
          
          if (detection) {
            descriptor = detection.descriptor;
          }
        }

        await registerFace(
          user.imageBlob,
          user.name,
          user.employee_id,
          user.department || 'General',
          user.position || 'Student',
          undefined,
          descriptor
        );

        setExtractedUsers(prev => prev.map((u, idx) => 
          idx === i ? { ...u, status: 'success' } : u
        ));
        successCount++;
      } catch (err) {
        setExtractedUsers(prev => prev.map((u, idx) => 
          idx === i ? { ...u, status: 'error', error: err instanceof Error ? err.message : 'Registration failed' } : u
        ));
      }

      completed++;
      setProgress((completed / total) * 100);
    }

    setIsRegistering(false);
    
    toast({
      title: "Bulk Registration Complete",
      description: `Successfully registered ${successCount} of ${total} users`,
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'processing': return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      default: return <div className="h-4 w-4 rounded-full bg-muted" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Bulk Registration from PDF
        </CardTitle>
        <CardDescription>
          Upload a PDF document containing student/employee information. AI will extract names, IDs, and photos automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Upload */}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isExtracting || isRegistering}
            className="flex-1"
          >
            {isExtracting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                <FileUp className="h-4 w-4 mr-2" />
                Upload PDF/Image
              </>
            )}
          </Button>
          
          {extractedUsers.length > 0 && (
            <Button
              onClick={handleRegisterAll}
              disabled={isRegistering || extractedUsers.every(u => u.status === 'success')}
            >
              {isRegistering ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Registering...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4 mr-2" />
                  Register All ({extractedUsers.filter(u => u.status === 'pending').length})
                </>
              )}
            </Button>
          )}
        </div>

        {/* Progress Bar */}
        {isRegistering && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground text-center">
              {Math.round(progress)}% complete
            </p>
          </div>
        )}

        {/* Extracted Users List */}
        {extractedUsers.length > 0 && (
          <ScrollArea className="h-64 border rounded-lg">
            <div className="p-3 space-y-2">
              {extractedUsers.map((user, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                >
                  {user.imageBlob ? (
                    <img
                      src={URL.createObjectURL(user.imageBlob)}
                      alt={user.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <Users className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{user.name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {user.employee_id} • {user.department}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {user.status === 'error' && (
                      <Badge variant="destructive" className="text-xs">
                        {user.error}
                      </Badge>
                    )}
                    {getStatusIcon(user.status)}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Instructions */}
        {extractedUsers.length === 0 && !isExtracting && (
          <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg">
            <p className="font-medium mb-2">Supported formats:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>PDF documents with student/employee lists</li>
              <li>ID cards or admission forms (images)</li>
              <li>Class photos with name labels</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PDFBulkRegistration;
