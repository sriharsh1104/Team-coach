import { IsString } from 'class-validator';

export class GoogleLoginDto {
  // ID token obtained on the client from Google Sign-In (Expo AuthSession /
  // @react-native-google-signin), verified server-side before trusting it.
  @IsString()
  idToken: string;
}
