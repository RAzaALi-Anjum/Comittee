import { cnicAreaCodes } from './cnicAreaCodes.js';

/**
 * CNIC Region Triangulation
 * Maps the first 5 digits of a 13-digit Pakistani CNIC to its granular origin region.
 */
export const triangulateGranularRegion = (cnicString) => {
  if (!cnicString) return "Unknown Region";
  
  // Extract only digits
  const cleanCnic = cnicString.replace(/\D/g, "");
  
  if (cleanCnic.length < 5) return "Unknown Region";
  
  const fiveDigitCode = cleanCnic.substring(0, 5);
  if (cnicAreaCodes[fiveDigitCode]) {
      return cnicAreaCodes[fiveDigitCode];
  }
  
  const firstDigit = cleanCnic.charAt(0);
  
  const regionMap = {
    "1": "Khyber Pakhtunkhwa",
    "2": "FATA",
    "3": "Punjab",
    "4": "Sindh",
    "5": "Balochistan",
    "6": "Islamabad",
    "7": "Gilgit-Baltistan",
    "8": "AJK"
  };
  
  return regionMap[firstDigit] || "Unknown Region";
};

/**
 * CNIC Region Triangulation (Legacy)
 * Maps the first digit of a 13-digit Pakistani CNIC to its origin region.
 */
export const triangulateRegion = (cnicString) => {
  if (!cnicString) return "Unknown Region";
  
  // Extract only digits
  const cleanCnic = cnicString.replace(/\D/g, "");
  
  if (cleanCnic.length < 5) return "Unknown Region";
  
  const firstDigit = cleanCnic.charAt(0);
  
  const regionMap = {
    "1": "Khyber Pakhtunkhwa",
    "2": "FATA",
    "3": "Punjab",
    "4": "Sindh",
    "5": "Balochistan",
    "6": "Islamabad",
    "7": "Gilgit-Baltistan",
    "8": "AJK"
  };
  
  return regionMap[firstDigit] || "Unknown Region";
};
