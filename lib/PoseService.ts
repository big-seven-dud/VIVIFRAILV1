declare const Pose: any;

let poseInstance: any = null;
let isInitializing = false;
let isProcessing = false;

export const getPoseInstance = () => {
  if (poseInstance) return poseInstance;
  
  const g = window as any;
  // Try different possible paths for the Pose constructor
  const PoseClass = g.Pose?.Pose || g.Pose;

  if (!PoseClass) {
    if (g.pose_utils) console.log('MediaPipe: Found pose_utils but not Pose class.');
    return null;
  }

  if (!isInitializing) {
    isInitializing = true;
    try {
      poseInstance = new PoseClass({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
      });
      
      poseInstance.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      // Simple re-entrancy protection
      const originalSend = poseInstance.send.bind(poseInstance);
      let isBusy = false;
      poseInstance.send = async (options: any) => {
        if (isBusy) return;
        isBusy = true;
        try {
          await originalSend(options);
        } catch (err) {
          console.error("Pose send error:", err);
        } finally {
          isBusy = false;
        }
      };

      console.log('MediaPipe Pose instance created with re-entrancy protection.');
    } catch (err) {
      console.error('Error creating MediaPipe Pose instance:', err);
      isInitializing = false;
      return null;
    }
  }
  
  return poseInstance;
};

export const getCameraClass = () => {
  const g = window as any;
  if (g.Camera && typeof g.Camera === 'function') return g.Camera;
  if (g.Camera && g.Camera.Camera && typeof g.Camera.Camera === 'function') return g.Camera.Camera;
  if (g.camera_utils && g.camera_utils.Camera && typeof g.camera_utils.Camera === 'function') return g.camera_utils.Camera;
  return null;
};
