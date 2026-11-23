import {
  loadSavedAnnouncementTemplates,
  removeSavedAnnouncementTemplate,
  saveAnnouncementTemplate,
} from '../savedAnnouncementTemplates';

jest.mock('expo-file-system', () => {
  let store: string | null = null;
  return {
    documentDirectory: 'file:///doc/',
    getInfoAsync: jest.fn(async () => ({ exists: !!store })),
    readAsStringAsync: jest.fn(async () => store),
    writeAsStringAsync: jest.fn(async (_path: string, body: string) => {
      store = body;
    }),
    deleteAsync: jest.fn(async () => {
      store = null;
    }),
  };
});

describe('savedAnnouncementTemplates', () => {
  beforeEach(async () => {
    const FileSystem = require('expo-file-system');
    await FileSystem.deleteAsync('file:///doc/announcement-templates.json');
  });

  it('saves a template and loads it back by title', async () => {
    await saveAnnouncementTemplate({
      title: 'Scrim tonight',
      body: 'Be in voice at 8:45',
    });
    const list = await loadSavedAnnouncementTemplates();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      title: 'Scrim tonight',
      body: 'Be in voice at 8:45',
    });
  });

  it('replaces the same title instead of duplicating', async () => {
    await saveAnnouncementTemplate({ title: 'Scrim', body: 'v1' });
    await saveAnnouncementTemplate({ title: 'scrim', body: 'v2' });
    const list = await loadSavedAnnouncementTemplates();
    expect(list).toHaveLength(1);
    expect(list[0].body).toBe('v2');
  });

  it('removes a saved template', async () => {
    const [saved] = await saveAnnouncementTemplate({
      title: 'Practice',
      body: '10pm',
    });
    const next = await removeSavedAnnouncementTemplate(saved.id);
    expect(next).toEqual([]);
  });
});
