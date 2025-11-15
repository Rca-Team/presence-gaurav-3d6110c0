
import { supabase } from '@/integrations/supabase/client';
import { uploadImage } from './StorageService';
import { v4 as uuidv4 } from 'uuid';
import { descriptorToString } from './ModelService';

// Define an interface for the metadata to ensure type safety
export interface RegistrationMetadata {
  name: string;
  employee_id: string;
  department: string;
  position: string;
  firebase_image_url: string;
  faceDescriptor?: string; // Make this optional since it's added conditionally
}

export const registerFace = async (
  imageBlob: Blob,
  name: string,
  employee_id: string,
  department: string,
  position: string,
  userId: string | undefined,
  faceDescriptor?: Float32Array,
  parentContactInfo?: {
    phone?: string;
    parent_name?: string;
    parent_email?: string;
    parent_phone?: string;
  }
): Promise<any> => {
  try {
    console.log('Starting face registration process', {
      name,
      employee_id,
      department,
      position,
      hasDescriptor: !!faceDescriptor
    });
    
    let faceDescriptorString: string | null = null;
    
    if (!imageBlob || imageBlob.size === 0) {
      console.error('Invalid image blob provided');
      throw new Error('Invalid image: The image blob is empty or invalid');
    }
    
    if (!faceDescriptor) {
      console.warn('No face descriptor provided for registration. This may limit face recognition capabilities.');
    }
    
    // Create a proper File object from the blob
    const uniqueId = uuidv4();
    const file = new File([imageBlob], `face_${uniqueId}.jpg`, { type: 'image/jpeg' });
    
    // Generate a unique file path - simplified to avoid path issues
    const filePath = `${uniqueId}.jpg`;
    console.log('Uploading with path:', filePath);
    
    // Try to upload the image to storage or use base64 as fallback
    let imageUrl;
    try {
      // Using only the 'public' bucket to avoid permission issues
      imageUrl = await uploadImage(file, filePath);
      console.log('Face image uploaded successfully:', imageUrl);
    } catch (uploadError) {
      console.error('Error uploading image, using base64 fallback:', uploadError);
      
      // Fallback: store the image directly as base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageBlob);
      });
      
      imageUrl = await base64Promise;
      console.log('Image stored as base64 (fallback method)');
    }
    
    // Prepare metadata as a plain object that conforms to Json type
    const metadata: Record<string, any> = {
      name,
      employee_id,
      department,
      position,
      firebase_image_url: imageUrl
    };

    if (faceDescriptor) {
      faceDescriptorString = descriptorToString(faceDescriptor);
      console.log('Descriptor converted to string, length:', faceDescriptorString.length);
      metadata.faceDescriptor = faceDescriptorString;
    }
    
    // Create device info as a plain object that conforms to Json type
    const deviceInfo: Record<string, any> = {
      type: 'webcam',
      registration: 'true', // Must be string for RLS policy check
      metadata: {
        ...metadata,
        ...parentContactInfo
      },
      timestamp: new Date().toISOString()
    };

    console.log('Inserting attendance record with metadata');
    
    // Use a valid user ID or generate a new one
    const effectiveUserId = userId || uuidv4();
    console.log('Using user ID:', effectiveUserId);
    
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    
    // Insert registration record with proper authentication context
    const insertData = {
      user_id: effectiveUserId,
      timestamp: new Date().toISOString(),
      status: 'registered' as const,
      device_info: deviceInfo,
      image_url: imageUrl,
      face_descriptor: faceDescriptorString
    };

    // Try to insert with current auth context
    let { data: recordData, error: recordError } = await supabase
      .from('attendance_records')
      .insert(insertData)
      .select()
      .single();

    // If RLS blocks it, try with anon access (for public registration)
    if (recordError && recordError.code === '42501') {
      console.log('RLS blocked insert, attempting public registration...');
      
      // Create a simplified record for public registration
      const publicInsertData = {
        user_id: null, // Use null for public registrations
        timestamp: new Date().toISOString(),
        status: 'pending_approval' as const, // Status that allows public registration
        device_info: {
          type: 'webcam',
          registration: 'true', // Must be string for RLS policy
          metadata: deviceInfo.metadata,
          timestamp: deviceInfo.timestamp
        },
        image_url: imageUrl,
        face_descriptor: faceDescriptorString,
      };

      const result = await supabase
        .from('attendance_records')
        .insert(publicInsertData)
        .select()
        .single();
        
      recordData = result.data;
      recordError = result.error;
    }

    if (recordError) {
      console.error('Error inserting attendance record:', recordError);
      throw new Error(`Error inserting attendance record: ${recordError.message}`);
    }

    console.log('Registration completed successfully:', recordData);
    return recordData;
  } catch (error: any) {
    console.error('Face registration failed:', error);
    throw error;
  }
};

export const uploadFaceImage = async (imageBlob: Blob): Promise<string> => {
  try {
    console.log('Starting face image upload, blob size:', imageBlob.size);
    
    // Validate the blob
    if (!imageBlob || imageBlob.size === 0) {
      throw new Error('Invalid image: The image blob is empty or invalid');
    }
    
    // Create a unique filename
    const uniqueId = uuidv4();
    const file = new File([imageBlob], `face_${uniqueId}.jpg`, { type: 'image/jpeg' });
    const filePath = `${uniqueId}.jpg`;
    
    console.log('Uploading image as:', filePath);
    
    // Use our storage service upload function with 'public' bucket only
    const publicUrl = await uploadImage(file, filePath);
    console.log('Image uploaded successfully:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading face image:', error);
    throw error;
  }
};

// Store unrecognized face
export const storeUnrecognizedFace = async (imageData: string): Promise<void> => {
  try {
    console.log('Storing unrecognized face');
    
    // Convert base64 image data to a Blob
    const response = await fetch(imageData);
    const blob = await response.blob();
    
    if (!blob || blob.size === 0) {
      console.error('Failed to convert image data to blob');
      return;
    }
    
    // Upload the image or use base64 as fallback
    let imageUrl;
    try {
      imageUrl = await uploadFaceImage(blob);
    } catch (uploadError) {
      console.warn('Failed to upload unrecognized face, using base64 instead:', uploadError);
      imageUrl = imageData; // Use original base64 data
    }
    
    // Create a device info object with the current timestamp as a plain object
    const deviceInfo: Record<string, any> = {
      type: 'webcam',
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      firebase_image_url: imageUrl,
    };
    
    // Insert a record with status "unauthorized"
    const { error } = await supabase
      .from('attendance_records')
      .insert({
        user_id: null, // No user associated
        status: 'unauthorized',
        device_info: deviceInfo,
        image_url: imageUrl,
      });
    
    if (error) {
      console.error('Error storing unrecognized face:', error);
    } else {
      console.log('Unrecognized face stored successfully');
    }
  } catch (error) {
    console.error('Failed to store unrecognized face:', error);
  }
};
