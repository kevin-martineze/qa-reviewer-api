import { NotFound, S3Client, S3ServiceException } from '@aws-sdk/client-s3';

import { S3Storage } from './s3.storage';

const storage = () => new S3Storage({ bucket: 'b', region: 'us-east-1' });

describe('S3Storage.head', () => {
  afterEach(() => jest.restoreAllMocks());

  it('devuelve tamaño y tipo', async () => {
    jest
      .spyOn(S3Client.prototype, 'send')
      .mockImplementation(() => Promise.resolve({ ContentLength: 3, ContentType: 'image/png' }));
    await expect(storage().head('a.png')).resolves.toEqual({ bytes: 3, contentType: 'image/png' });
  });

  it('un objeto que no existe es null', async () => {
    const missing = new NotFound({ message: 'NotFound', $metadata: { httpStatusCode: 404 } });
    jest.spyOn(S3Client.prototype, 'send').mockImplementation(() => Promise.reject(missing));
    await expect(storage().head('nada.png')).resolves.toBeNull();
  });

  it('sin permiso o sin credenciales falla: readiness tiene que verlo', async () => {
    const forbidden = new S3ServiceException({
      name: 'Forbidden',
      $fault: 'client',
      $metadata: { httpStatusCode: 403 },
    });
    jest.spyOn(S3Client.prototype, 'send').mockImplementation(() => Promise.reject(forbidden));
    await expect(storage().head('a.png')).rejects.toBe(forbidden);

    const noCredentials = new Error('Could not load credentials from any providers');
    noCredentials.name = 'CredentialsProviderError';
    jest.spyOn(S3Client.prototype, 'send').mockImplementation(() => Promise.reject(noCredentials));
    await expect(storage().head('a.png')).rejects.toBe(noCredentials);
  });
});
