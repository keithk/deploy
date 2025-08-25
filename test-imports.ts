// Test script to verify imports
try {
  console.log("Testing core imports...");
  const core = await import("./packages/core/src/index.ts");
  console.log("Core imported successfully");
  console.log("Available exports:", Object.keys(core));
  
  console.log("\nTesting user model specifically...");
  const { UserModel, userModel, UserData } = core;
  console.log("UserModel:", typeof UserModel);
  console.log("userModel:", typeof userModel);
  console.log("UserData available:", UserData !== undefined);
  
} catch (error) {
  console.error("Import failed:", error);
}