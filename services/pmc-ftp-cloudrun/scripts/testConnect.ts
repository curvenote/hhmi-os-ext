/**
 * Ensure connectivity to sftp server
 */
import Client from 'ssh2-sftp-client';

async function connect() {
  try {
    console.log('trying to connect...');
    const client = new Client();
    await client.connect({
      host: '0.0.0.0',
      username: 'test',
      password: 'test',
    });
    const result = await client.list('upload/');
    await client.end();
    return result;
  } catch (error) {
    console.error('There was an error sending the request:', error);
    throw error;
  }
}

connect()
  .then((data) => console.log('Success:', data))
  .catch((error) => console.error('Error:', error));
