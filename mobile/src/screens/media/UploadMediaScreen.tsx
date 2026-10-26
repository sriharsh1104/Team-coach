import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  Alert,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as mediaApi from '../../api/media';
import { MainStackParamList } from '../../navigation/types';
import { sharedStyles } from '../shared';

type Props = NativeStackScreenProps<MainStackParamList, 'UploadMedia'>;

type PickedAsset = {
  uri: string;
  fileName: string;
  mimeType: string;
  type: 'IMAGE' | 'VIDEO';
};

export function UploadMediaScreen({ navigation }: Props) {
  const [asset, setAsset] = useState<PickedAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const pick = async (useCamera: boolean) => {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow access to continue.');
      return;
    }

    const mediaTypes: ImagePicker.MediaType[] = ['images', 'videos'];
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes });

    if (result.canceled || result.assets.length === 0) return;

    const picked = result.assets[0];
    const isVideo = picked.type === 'video';
    setAsset({
      uri: picked.uri,
      fileName: picked.fileName ?? `upload.${isVideo ? 'mp4' : 'jpg'}`,
      mimeType: picked.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
      type: isVideo ? 'VIDEO' : 'IMAGE',
    });
  };

  const onUpload = async () => {
    if (!asset) return;
    setIsUploading(true);
    try {
      await mediaApi.uploadMedia({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        type: asset.type,
        caption: caption || undefined,
      });
      Alert.alert('Uploaded', 'Your coach has been notified.');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert(
        'Upload failed',
        err?.response?.data?.message?.toString() ?? 'Please try again.',
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <View style={sharedStyles.container}>
      <Text style={sharedStyles.title}>Upload</Text>

      {asset?.type === 'IMAGE' && (
        <Image source={{ uri: asset.uri }} style={styles.preview} />
      )}
      {asset?.type === 'VIDEO' && (
        <View style={[styles.preview, styles.videoPlaceholder]}>
          <Text>🎬 {asset.fileName}</Text>
        </View>
      )}

      <Pressable style={sharedStyles.button} onPress={() => pick(false)}>
        <Text style={sharedStyles.buttonText}>Choose from Gallery</Text>
      </Pressable>
      <Pressable style={sharedStyles.button} onPress={() => pick(true)}>
        <Text style={sharedStyles.buttonText}>Use Camera</Text>
      </Pressable>

      <TextInput
        style={sharedStyles.input}
        placeholder="Caption (optional)"
        value={caption}
        onChangeText={setCaption}
      />

      <Pressable
        style={[
          sharedStyles.button,
          (!asset || isUploading) && sharedStyles.buttonDisabled,
        ]}
        disabled={!asset || isUploading}
        onPress={onUpload}
      >
        <Text style={sharedStyles.buttonText}>
          {isUploading ? 'Uploading…' : 'Upload'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: '#f1f1f1',
  },
  videoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
