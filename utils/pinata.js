const { PinataSDK } = require("pinata");
const fs = require("fs");
const dotenv = require("dotenv");

// Load environment variables from .env file
dotenv.config();

const { PinataSDK } = require('pinata'); // matches your snippet; change if using a different SDK

// Initialize Pinata SDK with your JWT
const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT,
  // The gateway is optional but recommended
  // pinataGateway: 'your_gateway_domain.mypinata.cloud' 
});

// Set the path to the image you want to upload
const imagePath = "./image_to_upload.png"; // <-- Update this path

async function uploadImage() {
  try {
    // Check if the file exists
    if (!fs.existsSync(imagePath)) {
      throw new Error(`File not found at: ${imagePath}`);
    }

    // Read the image file into a readable stream
    const readableStreamForFile = fs.createReadSt+ream(imagePath);

    // Optional: Add metadata to your pin
    const options = {
      pinataMetadata: {
        name: "My Pinata Image",
        keyvalues: {
          project: "My-Project",
        },
      },
      pinataOptions: {
        cidVersion: 0, // Use CIDv0 for compatibility with older tools
      },
    };

    // Upload the file to Pinata
    const uploadResponse = await pinata.upload.public.file(
      readableStreamForFile,
      options
    );

    // Log the entire response to the console
    console.log("File uploaded successfully!");
    console.log(uploadResponse);

    // Extract and log the CID
    const cid = uploadResponse.cid;
    console.log("\n-------------------------");
    console.log(`The CID is: ${cid}`);
    console.log("-------------------------");

    return cid;
  } catch (error) {
    console.error("Error uploading file to Pinata:", error);
    if (error.response) {
      // Pinata API returns a more detailed error
      console.error("Pinata API error message:", error.response.data);
    }
    return null;
  }
}

// Run the upload function
uploadImage();