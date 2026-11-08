import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';
import i18n from '../i18n';
import { api } from './api';
import type { Me } from './types';

/** صورة شخصية: نصغرها قبل الرفع حتى ما تاخذ نت */
export async function pickAndUploadPhoto(): Promise<Me | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
  if (r.canceled || !r.assets[0]) return null;
  return uploadAvatar(r.assets[0].uri);
}

/** صورة الكابتن الشخصية: من الكاميرا الأمامية مباشرة (مو من المعرض) — إلزامية */
export async function takeAndUploadSelfie(): Promise<Me | null> {
  if (Platform.OS === 'web') return pickAndUploadPhoto();
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('', i18n.t('photo.cameraDenied'));
    return null;
  }
  const r = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    cameraType: ImagePicker.CameraType.front,
  });
  if (r.canceled || !r.assets[0]) return null;
  return uploadAvatar(r.assets[0].uri);
}

async function uploadAvatar(uri: string): Promise<Me> {
  const small = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 400 } }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  return api<Me>('/api/me/photo', { body: { image: small.base64, mime: 'image/jpeg' }, timeoutMs: 30000 });
}

export type DocKind =
  | 'id_front'
  | 'id_back'
  | 'residence_front'
  | 'residence_back'
  | 'vehicle_doc'
  | 'car_photo'
  | 'selfie'
  | 'package'
  | 'receipt';

/** يسأل: كاميرا لو معرض الصور */
export function askSource(): Promise<'camera' | 'library' | null> {
  if (Platform.OS === 'web') return Promise.resolve('library');
  return new Promise((resolve) => {
    Alert.alert(
      '',
      i18n.t('photo.chooseSource'),
      [
        { text: i18n.t('photo.camera'), onPress: () => resolve('camera') },
        { text: i18n.t('photo.gallery'), onPress: () => resolve('library') },
        { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

async function pick(source: 'camera' | 'library') {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('', i18n.t('photo.cameraDenied'));
      return null;
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    return r.canceled ? null : (r.assets[0] ?? null);
  }
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  return r.canceled ? null : (r.assets[0] ?? null);
}

/**
 * مستمسك أو صورة خاصة (هوية، سكن، سنوية، صورة ويا السيارة، صورة الطلب، وصل):
 * نصغرها لعرض 1280 (واضحة للقراءة وحجمها صغير) ونرفعها. ترجع رقم المستمسك.
 */
export async function pickAndUploadDocument(kind: DocKind, source?: 'camera' | 'library'): Promise<{ id: string; uri: string } | null> {
  const src = source ?? (await askSource());
  if (!src) return null;
  const asset = await pick(src);
  if (!asset) return null;
  const width = Math.min(1280, asset.width || 1280);
  const small = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width } }], {
    compress: 0.6,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  const r = await api<{ id: string }>('/api/me/documents', {
    body: { kind, image: small.base64, mime: 'image/jpeg' },
    timeoutMs: 45000,
  });
  return { id: r.id, uri: small.uri };
}
