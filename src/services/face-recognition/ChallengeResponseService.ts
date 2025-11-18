// Challenge-Response Anti-Spoofing Service
import * as faceapi from 'face-api.js';

export type ChallengeType = 'blink' | 'turnLeft' | 'turnRight' | 'smile' | 'nod';

export interface Challenge {
  type: ChallengeType;
  instruction: string;
  duration: number; // milliseconds
  icon: string;
}

export interface ChallengeResult {
  type: ChallengeType;
  verified: boolean;
  confidence: number;
  details: string;
}

// Define available challenges
const challenges: Challenge[] = [
  { type: 'blink', instruction: 'Blink twice', duration: 3000, icon: '👁️' },
  { type: 'turnLeft', instruction: 'Turn your head left', duration: 2500, icon: '👈' },
  { type: 'turnRight', instruction: 'Turn your head right', duration: 2500, icon: '👉' },
  { type: 'smile', instruction: 'Smile', duration: 2000, icon: '😊' },
  { type: 'nod', instruction: 'Nod your head', duration: 3000, icon: '👆' },
];

// Get random challenge
export const getRandomChallenge = (): Challenge => {
  return challenges[Math.floor(Math.random() * challenges.length)];
};

// Get multiple random challenges
export const getRandomChallenges = (count: number = 2): Challenge[] => {
  const shuffled = [...challenges].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, challenges.length));
};

// Verify blink challenge
export const verifyBlinkChallenge = (
  frames: ImageData[],
  detections: faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>[]
): ChallengeResult => {
  if (frames.length < 3 || detections.length < 3) {
    return { type: 'blink', verified: false, confidence: 0, details: 'Insufficient frames' };
  }

  let blinkCount = 0;
  let wasOpen = true;

  // Analyze eye aspect ratio changes
  for (let i = 1; i < detections.length; i++) {
    const prev = detections[i - 1];
    const curr = detections[i];

    if (!prev.landmarks || !curr.landmarks) continue;

    const prevEAR = calculateEyeAspectRatio(prev.landmarks);
    const currEAR = calculateEyeAspectRatio(curr.landmarks);

    // Detect eye closure (EAR drops below threshold)
    if (wasOpen && currEAR < 0.2) {
      wasOpen = false;
    } else if (!wasOpen && currEAR > 0.25) {
      wasOpen = true;
      blinkCount++;
    }
  }

  const verified = blinkCount >= 2;
  const confidence = Math.min(blinkCount / 2, 1);

  return {
    type: 'blink',
    verified,
    confidence,
    details: `Detected ${blinkCount} blinks (required: 2)`
  };
};

// Calculate Eye Aspect Ratio for blink detection
const calculateEyeAspectRatio = (landmarks: faceapi.FaceLandmarks68): number => {
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();

  const leftEAR = getEyeAspectRatio(leftEye);
  const rightEAR = getEyeAspectRatio(rightEye);

  return (leftEAR + rightEAR) / 2;
};

const getEyeAspectRatio = (eye: faceapi.Point[]): number => {
  if (eye.length < 6) return 0;

  const vertical1 = distance(eye[1], eye[5]);
  const vertical2 = distance(eye[2], eye[4]);
  const horizontal = distance(eye[0], eye[3]);

  return (vertical1 + vertical2) / (2 * horizontal);
};

const distance = (p1: faceapi.Point, p2: faceapi.Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

// Verify head turn challenge
export const verifyHeadTurnChallenge = (
  detections: faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>[],
  direction: 'left' | 'right'
): ChallengeResult => {
  if (detections.length < 2) {
    return {
      type: direction === 'left' ? 'turnLeft' : 'turnRight',
      verified: false,
      confidence: 0,
      details: 'Insufficient detections'
    };
  }

  let maxTurn = 0;
  const initialDetection = detections[0];
  const initialNose = initialDetection.landmarks?.getNose()[3];

  for (let i = 1; i < detections.length; i++) {
    const current = detections[i];
    const currentNose = current.landmarks?.getNose()[3];

    if (!initialNose || !currentNose) continue;

    const horizontalMovement = currentNose.x - initialNose.x;
    const faceWidth = current.detection.box.width;
    const turnRatio = Math.abs(horizontalMovement) / faceWidth;

    maxTurn = Math.max(maxTurn, turnRatio);
  }

  // Check if turn direction matches
  const firstNose = detections[0].landmarks?.getNose()[3];
  const lastNose = detections[detections.length - 1].landmarks?.getNose()[3];
  const actualDirection = lastNose && firstNose && lastNose.x < firstNose.x ? 'left' : 'right';

  const verified = maxTurn > 0.15 && actualDirection === direction;
  const confidence = Math.min(maxTurn / 0.2, 1);

  return {
    type: direction === 'left' ? 'turnLeft' : 'turnRight',
    verified,
    confidence,
    details: `Turn detected: ${(maxTurn * 100).toFixed(1)}% (required: 15%)`
  };
};

// Verify smile challenge
export const verifySmileChallenge = (
  expressions: faceapi.FaceExpressions[]
): ChallengeResult => {
  if (expressions.length < 2) {
    return { type: 'smile', verified: false, confidence: 0, details: 'Insufficient expressions' };
  }

  let maxHappiness = 0;
  let avgHappiness = 0;

  for (const expr of expressions) {
    const happiness = expr.happy;
    maxHappiness = Math.max(maxHappiness, happiness);
    avgHappiness += happiness;
  }

  avgHappiness = avgHappiness / expressions.length;

  const verified = maxHappiness > 0.7 && avgHappiness > 0.4;
  const confidence = Math.min(maxHappiness, 1);

  return {
    type: 'smile',
    verified,
    confidence,
    details: `Happiness detected: ${(maxHappiness * 100).toFixed(1)}% (required: 70%)`
  };
};

// Verify nod challenge
export const verifyNodChallenge = (
  detections: faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>[]
): ChallengeResult => {
  if (detections.length < 3) {
    return { type: 'nod', verified: false, confidence: 0, details: 'Insufficient detections' };
  }

  let verticalMovements: number[] = [];
  
  for (let i = 1; i < detections.length; i++) {
    const prev = detections[i - 1];
    const curr = detections[i];

    const prevNose = prev.landmarks?.getNose()[3];
    const currNose = curr.landmarks?.getNose()[3];

    if (!prevNose || !currNose) continue;

    const verticalMovement = currNose.y - prevNose.y;
    verticalMovements.push(verticalMovement);
  }

  // Check for up-down pattern (nod)
  let nodCount = 0;
  let direction = 0; // 1 = down, -1 = up

  for (const movement of verticalMovements) {
    if (Math.abs(movement) > 5) {
      const newDirection = movement > 0 ? 1 : -1;
      if (direction !== 0 && direction !== newDirection) {
        nodCount++;
      }
      direction = newDirection;
    }
  }

  const verified = nodCount >= 1;
  const confidence = Math.min(nodCount, 1);

  return {
    type: 'nod',
    verified,
    confidence,
    details: `Nod movements detected: ${nodCount} (required: 1)`
  };
};

// Main verification function
export const verifyChallengeResponse = async (
  challenge: Challenge,
  frames: ImageData[],
  detections: faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>[],
  expressions?: faceapi.FaceExpressions[]
): Promise<ChallengeResult> => {
  switch (challenge.type) {
    case 'blink':
      return verifyBlinkChallenge(frames, detections);
    case 'turnLeft':
      return verifyHeadTurnChallenge(detections, 'left');
    case 'turnRight':
      return verifyHeadTurnChallenge(detections, 'right');
    case 'smile':
      return verifySmileChallenge(expressions || []);
    case 'nod':
      return verifyNodChallenge(detections);
    default:
      return { type: challenge.type, verified: false, confidence: 0, details: 'Unknown challenge' };
  }
};
