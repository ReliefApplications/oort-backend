import { BlobServiceClient } from '@azure/storage-blob';
import * as dotenv from 'dotenv';
dotenv.config();

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;

/**
 * Download a file from Azure storage and put it locally, waiting for the response to be sent.
 * @param containerName Azure blob container name
 * @param blobName Azure blob name
 * @returns return once file downloaded
 */
export const downloadFile = async (containerName: string, blobName: string): Promise<void> => {
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    console.log('I have the file');
    await blockBlobClient.downloadToFile(`files/${blobName}`);
    console.log('download to ', `files/${blobName}`);
    return;
};
