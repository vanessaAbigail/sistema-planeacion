const { google } = require("googleapis");
const readline = require("readline");

const CLIENT_ID = "779911044839-5rpnnct0qhvlcdasu73bojs207cjt2i5.apps.googleusercontent.com";

const CLIENT_SECRET = "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";
const REDIRECT_URI = "http://localhost:3000/oauth2callback";

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const scopes = [
  "https://www.googleapis.com/auth/drive"
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: scopes
});

console.log("\nAbre este enlace en tu navegador:\n");
console.log(authUrl);


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});


rl.question("\nPega aquí el código de Google: ", async(code)=>{

  try{

    const {tokens} = await oauth2Client.getToken(code);

    console.log("\nTOKEN NUEVO:");
    console.log(tokens.refresh_token);

  }catch(error){

    console.log("ERROR:");
    console.log(error);

  }

  rl.close();

});