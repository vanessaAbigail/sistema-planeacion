const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const CLIENT_ID = "779911044839-5rpnnct0qhvlcdasu73bojs207cjt2i5.apps.googleusercontent.com";

const CLIENT_SECRET = "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";

const REDIRECT_URI = "http://localhost:3000/oauth2callback";

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// 🔴 ESTE TOKEN LO GENERAS UNA VEZ (te explico abajo)

oAuth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const drive = google.drive({
  version: "v3",
  auth: oAuth2Client
});

async function subirArchivoDrive(rutaArchivo, nombreArchivo) {

  console.log("🚀 Iniciando subida a Drive...");

  const response = await drive.files.create({
    requestBody: {
      name: nombreArchivo,
      mimeType: "application/pdf",
    },
    media: {
      mimeType: "application/pdf",
      body: fs.createReadStream(rutaArchivo),
    },
  });

  console.log("✅ Archivo subido:", response.data.id);

  return response.data;
}

async function hacerPublico(fileId) {

  console.log("🔓 Haciendo público:", fileId);

  await drive.permissions.create({
    fileId: fileId,
    requestBody: {
      role: "reader",
      type: "anyone"
    }
  });

  console.log("✅ Archivo público");

  return `https://drive.google.com/file/d/${fileId}/view`;
}

module.exports = { 
  subirArchivoDrive, 
  hacerPublico,
  oAuth2Client
};