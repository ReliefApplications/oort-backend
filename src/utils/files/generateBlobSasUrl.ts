import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
} from '@azure/storage-blob';
import logger from '@lib/logger';
import config from 'config';

/** Azure storage connection string */
const AZURE_STORAGE_CONNECTION_STRING: string = config.get(
  'blobStorage.connectionString'
);

/**
 * Generate blob SAS URL from container and blob name.
 *
 * @param containerName Container name
 * @param blobName Blob name
 * @returns Blob SAS URL
 */
export const generateBlobSasUrl = async (
  containerName: string,
  blobName: string
): Promise<string> => {
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    AZURE_STORAGE_CONNECTION_STRING
  );
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  try {
    const url = await blockBlobClient.generateSasUrl({
      permissions: BlobSASPermissions.parse('r'),
      expiresOn: new Date(new Date().valueOf() + 3600 * 1000), // 1 hour,
      protocol: SASProtocol.HttpsAndHttp,
    });
    return url;
  } catch (err) {
    logger.error(err.message);
    throw new Error(err.message);
  }
};
