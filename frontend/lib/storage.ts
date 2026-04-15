import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

// Get storage instance
function getStorageInstance() {
  if (!storage) {
    throw new Error('Firebase Storage not initialized. Check your .env.local configuration.');
  }
  return storage;
}

export interface UploadProgress {
  progress: number; // 0-100
  state: 'uploading' | 'complete' | 'error';
  storagePath?: string;
  error?: string;
}

type ProgressCallback = (progress: UploadProgress) => void;

/**
 * Upload a dataset file to Firebase Storage.
 * Returns the storage path (used by backend to download the file).
 */
export async function uploadDatasetFile(
  file: File,
  orgId: string,
  onProgress?: ProgressCallback,
): Promise<string> {
  const storageInstance = getStorageInstance();

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `uploads/${orgId}/datasets/${timestamp}_${safeName}`;
  const storageRef = ref(storageInstance, storagePath);

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        );
        onProgress?.({
          progress,
          state: 'uploading',
        });
      },
      (error) => {
        onProgress?.({
          progress: 0,
          state: 'error',
          error: error.message,
        });
        reject(error);
      },
      () => {
        onProgress?.({
          progress: 100,
          state: 'complete',
          storagePath,
        });
        resolve(storagePath);
      }
    );
  });
}

/**
 * Upload a model file to Firebase Storage.
 */
export async function uploadModelFile(
  file: File,
  orgId: string,
  onProgress?: ProgressCallback,
): Promise<string> {
  const storageInstance = getStorageInstance();

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `uploads/${orgId}/models/${timestamp}_${safeName}`;
  const storageRef = ref(storageInstance, storagePath);

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        );
        onProgress?.({
          progress,
          state: 'uploading',
        });
      },
      (error) => {
        onProgress?.({
          progress: 0,
          state: 'error',
          error: error.message,
        });
        reject(error);
      },
      () => {
        onProgress?.({
          progress: 100,
          state: 'complete',
          storagePath,
        });
        resolve(storagePath);
      }
    );
  });
}
