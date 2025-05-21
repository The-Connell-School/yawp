import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { config } from 'dotenv';

config();

const sqs = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const QUEUE_URL = process.env.SQS_QUEUE_URL || '';

async function processMessage(message: any) {
  try {
    const body = JSON.parse(message.Body);
    console.log('Processing message:', body);

    // Add your message processing logic here

    await sqs.send(
      new DeleteMessageCommand({
        QueueUrl: QUEUE_URL,
        ReceiptHandle: message.ReceiptHandle,
      })
    );
  } catch (error) {
    console.error('Error processing message:', error);
  }
}

async function pollQueue() {
  while (true) {
    try {
      const response = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: QUEUE_URL,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20,
        })
      );

      if (response.Messages && response.Messages.length > 0) {
        await Promise.all(response.Messages.map(processMessage));
      }
    } catch (error) {
      console.error('Error polling queue:', error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

pollQueue().catch(console.error);
