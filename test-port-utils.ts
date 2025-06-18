#!/usr/bin/env bun
import { isPortInUse, findAvailablePort, findAvailablePorts, getPortConfig } from "./packages/core/src/utils/portUtils";

async function testPortUtils() {
  console.log("Testing port utilities...");
  
  // Test port config
  const config = getPortConfig();
  console.log("Port config:", config);
  
  // Test if port 3000 is in use (should be true since dev server is running)
  const port3000InUse = await isPortInUse(3000);
  console.log(`Port 3000 in use: ${port3000InUse}`);
  
  // Find an available port starting from 3001
  const availablePort = await findAvailablePort(3001);
  console.log(`Available port starting from 3001: ${availablePort}`);
  
  // Test if the found port is actually available
  if (availablePort !== -1) {
    const isAvailable = await isPortInUse(availablePort);
    console.log(`Port ${availablePort} is actually in use: ${isAvailable}`);
  }
  
  // Find multiple available ports
  const multiplePorts = await findAvailablePorts(3005, 3);
  console.log(`Found ${multiplePorts.length} available ports: ${multiplePorts.join(", ")}`);
  
  console.log("Port utility tests completed!");
}

testPortUtils().catch(console.error);