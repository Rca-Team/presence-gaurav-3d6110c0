import * as faceapi from 'face-api.js';

export interface FaceAnalysisResult {
  age?: number;
  gender?: 'male' | 'female';
  genderProbability?: number;
  expressions?: {
    neutral: number;
    happy: number;
    sad: number;
    angry: number;
    fearful: number;
    disgusted: number;
    surprised: number;
  };
  quality?: {
    score: number;
    blur: number;
    brightness: number;
    resolution: number;
  };
  liveness?: {
    isLive: boolean;
    confidence: number;
    checks: {
      blinkDetected: boolean;
      eyeMovement: boolean;
      headMovement: boolean;
    };
  };
}

export interface MultipleFaceResult {
  faces: Array<{
    detection: faceapi.FaceDetection;
    analysis: FaceAnalysisResult;
    descriptor: Float32Array;
    boundingBox: { x: number; y: number; width: number; height: number };
  }>;
  count: number;
}

// Face quality assessment
export const assessFaceQuality = (
  canvas: HTMLCanvasElement,
  detection: faceapi.FaceDetection
): { score: number; blur: number; brightness: number; resolution: number } => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { score: 0, blur: 0, brightness: 0, resolution: 0 };

  const box = detection.box;
  const imageData = ctx.getImageData(box.x, box.y, box.width, box.height);
  const data = imageData.data;

  // Calculate brightness
  let brightness = 0;
  for (let i = 0; i < data.length; i += 4) {
    brightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  brightness = brightness / (data.length / 4) / 255;

  // Simple blur detection using edge detection
  let blur = 0;
  const width = imageData.width;
  for (let i = width + 1; i < data.length - width - 1; i += 4) {
    const current = data[i];
    const diff = Math.abs(current - data[i - 4]) + Math.abs(current - data[i + 4]);
    blur += diff;
  }
  blur = 1 - Math.min(blur / (data.length / 4) / 255, 1);

  // Resolution assessment
  const resolution = Math.min(box.width * box.height / (160 * 160), 1);

  // Overall quality score
  const score = (brightness * 0.3 + (1 - blur) * 0.4 + resolution * 0.3);

  return { score, blur, brightness, resolution };
};

// Advanced texture analysis to detect video playback vs real skin
export const analyzeTextureForSpoofing = (
  canvas: HTMLCanvasElement,
  detection: faceapi.FaceDetection
): { isRealSkin: boolean; textureScore: number; details: any } => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { isRealSkin: false, textureScore: 0, details: {} };

  const box = detection.box;
  const imageData = ctx.getImageData(box.x, box.y, box.width, box.height);
  const data = imageData.data;

  // Analyze skin texture patterns
  let textureVariance = 0;
  let colorConsistency = 0;
  let microPatterns = 0;

  // Calculate local texture variance (real skin has micro-variations)
  for (let y = 1; y < imageData.height - 1; y++) {
    for (let x = 1; x < imageData.width - 1; x++) {
      const idx = (y * imageData.width + x) * 4;
      const neighbors = [
        data[idx - imageData.width * 4],
        data[idx + imageData.width * 4],
        data[idx - 4],
        data[idx + 4]
      ];
      const avg = neighbors.reduce((a, b) => a + b, 0) / 4;
      textureVariance += neighbors.reduce((sum, val) => sum + Math.abs(val - avg), 0);
    }
  }
  textureVariance = textureVariance / (imageData.width * imageData.height);

  // Check for unnatural color consistency (screens have too perfect pixels)
  let colorGroups = new Map<string, number>();
  for (let i = 0; i < data.length; i += 4) {
    const colorKey = `${Math.floor(data[i] / 10)},${Math.floor(data[i + 1] / 10)},${Math.floor(data[i + 2] / 10)}`;
    colorGroups.set(colorKey, (colorGroups.get(colorKey) || 0) + 1);
  }
  colorConsistency = colorGroups.size / (imageData.width * imageData.height);

  // Detect micro-patterns (real skin has natural texture, screens have pixel patterns)
  for (let i = 0; i < data.length - 8; i += 8) {
    const diff = Math.abs(data[i] - data[i + 4]);
    if (diff > 2 && diff < 20) microPatterns++;
  }
  microPatterns = microPatterns / (data.length / 8);

  // Combined texture score (higher = more likely real skin)
  const textureScore = (textureVariance / 50) * 0.4 + colorConsistency * 0.3 + microPatterns * 0.3;
  const isRealSkin = textureScore > 0.35; // Threshold for real skin

  return {
    isRealSkin,
    textureScore,
    details: { textureVariance, colorConsistency, microPatterns }
  };
};

// Advanced liveness detection with challenge verification
export const detectLiveness = async (
  videoElement: HTMLVideoElement,
  previousFrames: ImageData[] = [],
  challengeCompleted?: { type: string; verified: boolean }
): Promise<{ isLive: boolean; confidence: number; checks: any }> => {
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return { isLive: false, confidence: 0, checks: {} };

  ctx.drawImage(videoElement, 0, 0);
  const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let eyeMovement = false;
  let headMovement = false;
  let blinkDetected = false;
  let naturalMovement = false;

  // Enhanced movement detection
  if (previousFrames.length > 2) {
    const prevFrame = previousFrames[previousFrames.length - 1];
    const prevFrame2 = previousFrames[previousFrames.length - 2];
    
    let totalDiff = 0;
    let movementPattern = 0;
    
    for (let i = 0; i < currentFrame.data.length; i += 4) {
      const diff = Math.abs(currentFrame.data[i] - prevFrame.data[i]);
      const diff2 = Math.abs(prevFrame.data[i] - prevFrame2.data[i]);
      totalDiff += diff;
      
      // Check for natural movement patterns (not uniform like video playback)
      if (Math.abs(diff - diff2) > 3) {
        movementPattern++;
      }
    }
    
    const avgDiff = totalDiff / (currentFrame.data.length / 4);
    naturalMovement = movementPattern > (currentFrame.data.length / 8);
    headMovement = avgDiff > 5 && naturalMovement;
    eyeMovement = avgDiff > 2 && avgDiff < 15;
    blinkDetected = avgDiff > 3 && avgDiff < 10;
  }

  // Store frame for next comparison (keep last 10 frames for better analysis)
  previousFrames.push(currentFrame);
  if (previousFrames.length > 10) {
    previousFrames.shift();
  }

  // Challenge verification adds significant confidence
  const challengeScore = challengeCompleted?.verified ? 0.5 : 0;
  
  const checks = { 
    blinkDetected, 
    eyeMovement, 
    headMovement, 
    naturalMovement,
    challengeCompleted: challengeCompleted?.verified || false
  };
  
  const movementScore = Object.values(checks).filter(Boolean).length / Object.keys(checks).length;
  const confidence = (movementScore * 0.5) + challengeScore;
  const isLive = confidence > 0.6; // Stricter threshold

  return { isLive, confidence, checks };
};

// Enhanced face analysis with age, gender, and expressions
export const analyzeFace = async (
  imageElement: HTMLImageElement | HTMLVideoElement
): Promise<FaceAnalysisResult | null> => {
  try {
    // Detect face with all features
    const detection = await faceapi
      .detectSingleFace(imageElement, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceExpressions()
      .withAgeAndGender();

    if (!detection) return null;

    const canvas = document.createElement('canvas');
    canvas.width = imageElement instanceof HTMLVideoElement ? 
      imageElement.videoWidth : imageElement.width;
    canvas.height = imageElement instanceof HTMLVideoElement ? 
      imageElement.videoHeight : imageElement.height;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(imageElement, 0, 0);
    }

    // Quality assessment
    const quality = canvas && ctx ? 
      assessFaceQuality(canvas, detection.detection) : 
      { score: 0.5, blur: 0.5, brightness: 0.5, resolution: 0.5 };

    // Liveness detection (only for video)
    let liveness = undefined;
    if (imageElement instanceof HTMLVideoElement) {
      liveness = await detectLiveness(imageElement);
    }

    return {
      age: Math.round(detection.age),
      gender: detection.gender as 'male' | 'female',
      genderProbability: detection.genderProbability,
      expressions: detection.expressions,
      quality,
      liveness
    };
  } catch (error) {
    console.error('Error analyzing face:', error);
    return null;
  }
};

// Multiple face detection and analysis
export const detectMultipleFaces = async (
  imageElement: HTMLImageElement | HTMLVideoElement
): Promise<MultipleFaceResult> => {
  try {
    const detections = await faceapi
      .detectAllFaces(imageElement, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors()
      .withFaceExpressions()
      .withAgeAndGender();

    const canvas = document.createElement('canvas');
    canvas.width = imageElement instanceof HTMLVideoElement ? 
      imageElement.videoWidth : imageElement.width;
    canvas.height = imageElement instanceof HTMLVideoElement ? 
      imageElement.videoHeight : imageElement.height;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(imageElement, 0, 0);
    }

    const faces = await Promise.all(
      detections.map(async (detection) => {
        const quality = canvas && ctx ? 
          assessFaceQuality(canvas, detection.detection) : 
          { score: 0.5, blur: 0.5, brightness: 0.5, resolution: 0.5 };

        let liveness = undefined;
        if (imageElement instanceof HTMLVideoElement) {
          liveness = await detectLiveness(imageElement);
        }

        const analysis: FaceAnalysisResult = {
          age: Math.round(detection.age),
          gender: detection.gender as 'male' | 'female',
          genderProbability: detection.genderProbability,
          expressions: detection.expressions,
          quality,
          liveness
        };

        return {
          detection: detection.detection,
          analysis,
          descriptor: detection.descriptor,
          boundingBox: {
            x: detection.detection.box.x,
            y: detection.detection.box.y,
            width: detection.detection.box.width,
            height: detection.detection.box.height
          }
        };
      })
    );

    return {
      faces,
      count: faces.length
    };
  } catch (error) {
    console.error('Error detecting multiple faces:', error);
    return { faces: [], count: 0 };
  }
};
