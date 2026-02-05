/**
 * Test containerized ftp service
 *
 * Container must be running first: npm run dev
 */
async function post(url: string, data: any) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.text();
    return result;
  } catch (error) {
    console.error('There was an error sending the request:', error);
    throw error;
  }
}

const postUrl = 'http://localhost:8080/';
const postData = {
  message: {
    attributes: {
      manifest: {
        agency: 'hhmi',
        files: [
          {
            filename: 'manuscript.docx',
            type: 'manuscript',
            label: '1',
            storage: 'bucket',
            path: 'https://www.cte.iup.edu/cte/Resources/DOCX_TestPage.docx',
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          {
            filename: 'figure1.png',
            type: 'figure',
            label: 'Figure 1',
            storage: 'bucket',
            path: 'https://en.wikipedia.org/wiki/PNG#/media/File:PNG_transparency_demonstration_1.png',
            contentType: 'image/png',
          },
        ],
        doi: '10.1038/s41467-024-48562-0',
        metadata: {
          title: 'My Research Article',
          journal: {
            issn: '0094-6354',
            issnType: 'print',
            title: 'Journal of Test Studies',
          },
          authors: [
            {
              fname: 'First',
              lname: 'Last',
              email: 'first.last@curvenote.org',
              contactType: 'reviewer',
            },
          ],
          grants: [
            {
              funder: 'hhmi',
            },
            {
              funder: 'nih',
              id: '5R33MH125126-04',
            },
          ],
        },
        taskId: '27f14cb06d0',
      },
    },
  },
};

post(postUrl, postData)
  .then((data) => console.log('Success:', data))
  .catch((error) => console.error('Error:', error));
