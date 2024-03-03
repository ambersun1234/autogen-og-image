function formatDate(dateString) {
  const options = { year: "numeric", month: "short", day: "numeric" };
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", options);
}

function generateAvatarBlock(data) {
  if (data.avatar) {
    return `
      <div class="right">
        <img
          src="${data.avatar}"
          alt="${data.author}"
          width="100%"
          style="border-radius: 50%"
        />
      </div>
    `;
  }
  return "";
}

function generateHtml(data, options) {
  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>GitHub article Preview</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f6f8fa;
        }
  
        .article {
          width: 1200px;
          height: 630px;
          background-color: #fff;
          border: 1px solid #e1e4e8;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          padding: 32px;
          position: relative;
        }
  
        .article-header {
          padding: 32px;
          display: flex;
          justify-content: space-between;
          align-items: center;
  
          .article-name {
            font-size: ${options.headerSize}px;
            font-weight: 600;
            color: ${options.headerColor};
            flex: 1;
          }
        }
  
        .article-description {
          padding: 32px;
          font-size: ${options.descriptionSize}px;
          margin-top: 8px;
          display: flex;
          color: ${options.descriptionColor};
        }
  
        .article-footer {
          padding: 32px;
          border-top: 1px solid #e1e4e8;
          justify-content: space-between;
          align-items: center;
          font-size: ${options.footerSize}px;
          display: flex;
          width: calc(100% - 2 * 32px);
          bottom: 0;
          position: absolute;
          box-sizing: border-box;
          color: ${options.footerColor};
  
          .left {
            align-self: flex-start;
          }
          .right {
            align-self: flex-end;
          }
        }
  
        .container {
          display: flex;
  
          .left {
            width: 100%;
          }
  
          .right {
            flex: 0 0 20%;
            display: flex;
            justify-content: flex-end;
            align-items: center;
          }
        }
      </style>
    </head>
    <body>
      <div class="article">
        <div class="container">
          <div class="left">
            <div class="article-header">
              <div class="article-name">${data.title}</div>
            </div>
            <div class="article-description">${data.description}</div>
          </div>
          
          
          ${generateAvatarBlock(data)}
        </div>
  
        <div class="article-footer">
          <div class="left">${data.author}</div>
          <div class="right">
            <div class="repo-updated">Created on ${formatDate(data.date)}</div>
          </div>
        </div>
      </div>
    </body>
  </html>  
    `;
}

export { generateHtml };
