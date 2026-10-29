import { loadEnv } from './env';

describe('loadEnv', () => {
  it('sin PUBLIC_API_URL, la URL pública sale del puerto', () => {
    expect(loadEnv({ MONGO_URI: 'memory', PORT: '3100' }).PUBLIC_API_URL).toBe(
      'http://localhost:3100',
    );
    expect(loadEnv({ MONGO_URI: 'memory', PUBLIC_API_URL: '' }).PUBLIC_API_URL).toBe(
      'http://localhost:3000',
    );
  });

  it('respeta la URL pública configurada', () => {
    const env = loadEnv({ MONGO_URI: 'memory', PORT: '3100', PUBLIC_API_URL: 'https://api.x.co' });
    expect(env.PUBLIC_API_URL).toBe('https://api.x.co');
  });
});
