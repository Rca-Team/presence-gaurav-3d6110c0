import { supabase } from '@/integrations/supabase/client';
import { descriptorToString, stringToDescriptor } from './ModelService';

export interface FaceDescriptorRecord {
  id: string;
  user_id: string;
  descriptor: string;
  captured_at: string;
  confidence_score?: number;
  image_url?: string;
}

/**
 * Adaptive Learning Service
 * Stores multiple face descriptors per user to improve recognition accuracy over time
 */
export class AdaptiveLearningService {
  private static readonly MAX_DESCRIPTORS_PER_USER = 20; // Keep top 20 most recent/accurate
  private static readonly MIN_CONFIDENCE_TO_LEARN = 0.65; // Only learn from high-confidence matches
  
  /**
   * Store a new face descriptor for a user (learning from successful recognition)
   */
  static async learnFromCapture(
    userId: string,
    descriptor: Float32Array,
    confidence: number,
    imageUrl?: string
  ): Promise<boolean> {
    try {
      // Only learn from high-confidence captures
      if (confidence < this.MIN_CONFIDENCE_TO_LEARN) {
        console.log(`Skipping learning - confidence ${confidence.toFixed(2)} below threshold ${this.MIN_CONFIDENCE_TO_LEARN}`);
        return false;
      }

      const descriptorString = descriptorToString(descriptor);
      
      console.log(`Learning new face descriptor for user ${userId} with confidence ${confidence.toFixed(2)}`);
      
      // Insert new descriptor
      const { data: newRecord, error: insertError } = await supabase
        .from('face_descriptors')
        .insert({
          user_id: userId,
          descriptor: descriptorString,
          captured_at: new Date().toISOString(),
          confidence_score: confidence,
          image_url: imageUrl
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error storing new descriptor:', insertError);
        return false;
      }

      // Cleanup old descriptors (keep only the most recent/accurate ones)
      await this.cleanupOldDescriptors(userId);
      
      console.log(`Successfully learned new descriptor for user ${userId}`);
      return true;
      
    } catch (error) {
      console.error('Error in learnFromCapture:', error);
      return false;
    }
  }

  /**
   * Get all face descriptors for a user
   */
  static async getUserDescriptors(userId: string): Promise<Float32Array[]> {
    try {
      const { data, error } = await supabase
        .from('face_descriptors')
        .select('descriptor')
        .eq('user_id', userId)
        .order('confidence_score', { ascending: false, nullsFirst: false })
        .order('captured_at', { ascending: false });

      if (error) {
        console.error('Error fetching user descriptors:', error);
        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      return data
        .map(record => {
          try {
            return stringToDescriptor(record.descriptor);
          } catch (e) {
            console.error('Error parsing descriptor:', e);
            return null;
          }
        })
        .filter((d): d is Float32Array => d !== null);
      
    } catch (error) {
      console.error('Error in getUserDescriptors:', error);
      return [];
    }
  }

  /**
   * Get all registered users with their descriptors
   */
  static async getAllUserDescriptors(): Promise<Map<string, Float32Array[]>> {
    try {
      const { data, error } = await supabase
        .from('face_descriptors')
        .select('user_id, descriptor')
        .order('confidence_score', { ascending: false, nullsFirst: false });

      if (error) {
        console.error('Error fetching all descriptors:', error);
        return new Map();
      }

      const userDescriptorsMap = new Map<string, Float32Array[]>();

      for (const record of data || []) {
        try {
          const descriptor = stringToDescriptor(record.descriptor);
          const existing = userDescriptorsMap.get(record.user_id) || [];
          existing.push(descriptor);
          userDescriptorsMap.set(record.user_id, existing);
        } catch (e) {
          console.error('Error parsing descriptor for user:', record.user_id, e);
        }
      }

      console.log(`Loaded descriptors for ${userDescriptorsMap.size} users`);
      return userDescriptorsMap;
      
    } catch (error) {
      console.error('Error in getAllUserDescriptors:', error);
      return new Map();
    }
  }

  /**
   * Compare a face descriptor against all stored descriptors for all users
   * Uses ensemble averaging for better accuracy
   */
  static async recognizeWithAdaptiveLearning(
    faceDescriptor: Float32Array
  ): Promise<{
    userId: string | null;
    confidence: number;
    matchCount: number;
  }> {
    try {
      const allUserDescriptors = await this.getAllUserDescriptors();
      
      if (allUserDescriptors.size === 0) {
        console.log('No adaptive learning data available yet');
        return { userId: null, confidence: 0, matchCount: 0 };
      }

      let bestUserId: string | null = null;
      let bestAverageDistance = 1.0;
      let bestMatchCount = 0;

      // Compare against each user's stored descriptors
      for (const [userId, descriptors] of allUserDescriptors.entries()) {
        if (descriptors.length === 0) continue;

        // Calculate distances to all descriptors for this user
        const distances = descriptors.map(storedDescriptor => 
          this.calculateDistance(faceDescriptor, storedDescriptor)
        );

        // Use average of best 3 matches (or all if less than 3)
        const sortedDistances = distances.sort((a, b) => a - b);
        const topN = Math.min(3, sortedDistances.length);
        const avgDistance = sortedDistances.slice(0, topN).reduce((sum, d) => sum + d, 0) / topN;
        const matchCount = distances.filter(d => d < 0.45).length;

        console.log(`User ${userId}: avg distance = ${avgDistance.toFixed(4)} (${matchCount} good matches)`);

        // Better match if: lower average distance OR same distance but more matches
        if (avgDistance < bestAverageDistance || 
            (Math.abs(avgDistance - bestAverageDistance) < 0.02 && matchCount > bestMatchCount)) {
          bestAverageDistance = avgDistance;
          bestUserId = userId;
          bestMatchCount = matchCount;
        }
      }

      // Use stricter threshold: 0.40 for adaptive learning (more accurate)
      const confidence = bestAverageDistance < 0.40 ? (1 - bestAverageDistance) : 0;

      if (confidence > 0) {
        console.log(`Adaptive recognition: User ${bestUserId} with confidence ${confidence.toFixed(2)} (${bestMatchCount} matches)`);
      }

      return {
        userId: confidence > 0 ? bestUserId : null,
        confidence,
        matchCount: bestMatchCount
      };
      
    } catch (error) {
      console.error('Error in recognizeWithAdaptiveLearning:', error);
      return { userId: null, confidence: 0, matchCount: 0 };
    }
  }

  /**
   * Calculate Euclidean distance between two descriptors
   */
  private static calculateDistance(descriptor1: Float32Array, descriptor2: Float32Array): number {
    if (descriptor1.length !== descriptor2.length) {
      throw new Error('Descriptors have different dimensions');
    }
    
    let sum = 0;
    for (let i = 0; i < descriptor1.length; i++) {
      const diff = descriptor1[i] - descriptor2[i];
      sum += diff * diff;
    }
    
    return Math.sqrt(sum);
  }

  /**
   * Remove old descriptors to keep storage manageable
   */
  private static async cleanupOldDescriptors(userId: string): Promise<void> {
    try {
      // Get all descriptors for this user
      const { data, error } = await supabase
        .from('face_descriptors')
        .select('id, confidence_score, captured_at')
        .eq('user_id', userId)
        .order('confidence_score', { ascending: false, nullsFirst: false })
        .order('captured_at', { ascending: false });

      if (error || !data) return;

      // If we have more than MAX_DESCRIPTORS_PER_USER, delete the oldest/lowest confidence ones
      if (data.length > this.MAX_DESCRIPTORS_PER_USER) {
        const idsToDelete = data.slice(this.MAX_DESCRIPTORS_PER_USER).map(d => d.id);
        
        const { error: deleteError } = await supabase
          .from('face_descriptors')
          .delete()
          .in('id', idsToDelete);

        if (!deleteError) {
          console.log(`Cleaned up ${idsToDelete.length} old descriptors for user ${userId}`);
        }
      }
      
    } catch (error) {
      console.error('Error in cleanupOldDescriptors:', error);
    }
  }

  /**
   * Get statistics about adaptive learning data
   */
  static async getStats(): Promise<{
    totalUsers: number;
    totalDescriptors: number;
    avgDescriptorsPerUser: number;
  }> {
    try {
      const { data, error } = await supabase
        .from('face_descriptors')
        .select('user_id');

      if (error || !data) {
        return { totalUsers: 0, totalDescriptors: 0, avgDescriptorsPerUser: 0 };
      }

      const uniqueUsers = new Set(data.map(d => d.user_id)).size;
      const totalDescriptors = data.length;

      return {
        totalUsers: uniqueUsers,
        totalDescriptors,
        avgDescriptorsPerUser: uniqueUsers > 0 ? totalDescriptors / uniqueUsers : 0
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return { totalUsers: 0, totalDescriptors: 0, avgDescriptorsPerUser: 0 };
    }
  }
}
