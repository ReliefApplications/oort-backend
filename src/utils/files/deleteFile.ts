import { BlobServiceClient } from '@azure/storage-blob';
import { logger } from '@services/logger.service';
import { GraphQLError } from 'graphql';
import i18next from 'i18next';
import config from 'config';

/** Azure storage connection string */
const AZURE_STORAGE_CONNECTION_STRING: string = config.get(
  'blobStorage.connectionString'
);

/**
 * Delete a file in Azure storage.
 *
 * @param containerName main container name
 * @param path path to the blob
 */
export const deleteFile = async (
  containerName: string,
  path: string
): Promise<void> => {
  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      AZURE_STORAGE_CONNECTION_STRING
    );
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const file = containerClient.getBlockBlobClient(path);
    await file.deleteIfExists();
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    throw new GraphQLError(
      i18next.t('utils.files.uploadFile.errors.fileCannotBeDeleted')
    );
  }
};
