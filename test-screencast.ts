/**
 * Test script for CDP Screencast and Video Recording
 * 
 * Run with: npx tsx test-screencast.ts
 */

import { PlaywrightRunner, ScreencastFrame } from "./playwright-wrapper";
import * as fs from "fs";

async function testScreencast() {
  console.log("=== Testing CDP Screencast ===\n");

  const runner = new PlaywrightRunner({
    headless: false, // Set to true if you don't want to see the browser
  });

  // We need to manually set up the browser first for screencast
  // since startScreencast requires an active page
  const steps = await runner.run("https://example.com", []);
  
  let frameCount = 0;
  const frames: ScreencastFrame[] = [];

  // Start screencast
  await runner.startScreencast(
    (frame) => {
      frameCount++;
      frames.push(frame);
      console.log(`Frame ${frameCount}: ${frame.metadata.deviceWidth}x${frame.metadata.deviceHeight}`);
      
      // Save first frame as a sample
      if (frameCount === 1) {
        fs.writeFileSync("test-frame.png", Buffer.from(frame.data, "base64"));
        console.log("  → Saved first frame to test-frame.png");
      }
    },
    {
      format: "png",
      quality: 80,
      maxWidth: 1280,
      maxHeight: 720,
      everyNthFrame: 1,
    }
  );

  console.log("\nScreencast started. Waiting 3 seconds...\n");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Stop screencast
  await runner.stopScreencast();
  console.log(`\nScreencast stopped. Captured ${frameCount} frames.`);

  await runner.close();
}

async function testVideoRecording() {
  console.log("\n=== Testing Video Recording ===\n");

  const runner = new PlaywrightRunner({
    headless: false,
    recordVideo: false,
    videoDir: "./videos",
  });

  // Create videos directory if it doesn't exist
  if (!fs.existsSync("./videos")) {
    fs.mkdirSync("./videos");
  }

  // Run some actions
  const steps = await runner.run("https://example.com", [
    { type: "wait", value: "1000" },
    { type: "click", selector: "a" },
    { type: "wait", value: "1000" },
  ]);

  console.log("Steps completed:", steps.length);
  steps.forEach((step) => {
    console.log(`  ${step.index}. ${step.type}: ${step.status} (${step.duration}ms)`);
  });

  // Get video path before closing
  const videoPath = await runner.getVideoPath();
  console.log("\nVideo path:", videoPath);

  // Save video with custom name
  try {
    await runner.saveVideo("./videos/test-recording.webm");
    console.log("Video saved to ./videos/test-recording.webm");
  } catch (err) {
    console.log("Could not save video:", err);
  }

  await runner.close();
  console.log("\nVideo recording test complete!");
}

async function testBothFeatures() {
  console.log("\n=== Testing Screencast + Video Together ===\n");

  const runner = new PlaywrightRunner({
    headless: false,
    recordVideo: false,
    videoDir: "./videos",
  });

  if (!fs.existsSync("./videos")) {
    fs.mkdirSync("./videos");
  }

  // Initialize with navigation
  await runner.run("https://example.com", []);

  let frameCount = 0;

  // Start screencast while also recording video
  await runner.startScreencast(
    (frame) => {
      frameCount++;
      if (frameCount % 10 === 0) {
        console.log(`  Screencast frame ${frameCount}`);
      }
    },
    { everyNthFrame: 2 }
  );

  // Simulate some activity
  console.log("Recording for 5 seconds...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  await runner.stopScreencast();
  console.log(`Captured ${frameCount} screencast frames`);

  try {
    await runner.saveVideo("./videos/combined-test.webm");
    console.log("Video saved!");
  } catch (err) {
    console.log("Video save error:", err);
  }

  await runner.close();
}

// Run tests
(async () => {
  try {
    await testScreencast();
    await testVideoRecording();
    await testBothFeatures();
    console.log("\n✅ All tests completed!");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
})();
