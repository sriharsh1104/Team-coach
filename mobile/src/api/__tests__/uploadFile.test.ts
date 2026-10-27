import { Platform } from 'react-native';
import { appendFileToFormData } from '../uploadFile';

describe('appendFileToFormData', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('on native, appends the RN-style {uri, name, type} object directly (no network fetch)', async () => {
    (Platform as any).OS = 'ios';
    const fetchSpy = jest.spyOn(global, 'fetch' as any);
    const form = { append: jest.fn() } as unknown as FormData;

    await appendFileToFormData(form, {
      uri: 'file:///tmp/photo.jpg',
      name: 'photo.jpg',
      type: 'image/jpeg',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(form.append).toHaveBeenCalledWith('file', {
      uri: 'file:///tmp/photo.jpg',
      name: 'photo.jpg',
      type: 'image/jpeg',
    });
  });

  it('BUG FIX: on web, resolves the blob: uri to a real Blob before appending — the RN object shape sends no file at all in a browser', async () => {
    (Platform as any).OS = 'web';
    const fakeBlob = { size: 123 } as Blob;
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      blob: () => Promise.resolve(fakeBlob),
    } as any);
    const form = { append: jest.fn() } as unknown as FormData;

    await appendFileToFormData(form, {
      uri: 'blob:http://localhost:8090/abc-123',
      name: 'photo.jpg',
      type: 'image/jpeg',
    });

    expect(global.fetch).toHaveBeenCalledWith('blob:http://localhost:8090/abc-123');
    expect(form.append).toHaveBeenCalledWith('file', fakeBlob, 'photo.jpg');
  });
});
