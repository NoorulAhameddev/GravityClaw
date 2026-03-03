/**
 * Live Canvas Demo
 * 
 * This file demonstrates how to use the Live Canvas feature
 * Run this after starting the server to see widgets in action
 */

import { pushCanvas } from "./src/canvas/index.ts";

// Wait for a canvas client to connect at http://localhost:3000/canvas.html?session=demo

const SESSION_ID = "demo";

async function demo() {
  console.log("🎨 Live Canvas Demo");
  console.log("1. Start the server: npm run dev");
  console.log(`2. Open: http://localhost:3000/canvas.html?session=${SESSION_ID}`);
  console.log("3. Run this demo: tsx scripts/canvas-demo.ts");
  console.log("");
  
  // Wait for user to open canvas
  console.log("Waiting for canvas client to connect...");
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  try {
    // Demo 1: Simple greeting
    console.log("\n📤 Demo 1: Simple Greeting");
    await pushCanvas(SESSION_ID, `
      <div style="text-align: center; padding: 40px;">
        <h1 style="color: #667eea;">👋 Hello from Gravity Claw!</h1>
        <p>This is a live canvas widget pushed from the agent.</p>
      </div>
    `);
    await sleep(3000);
    
    // Demo 2: Interactive button
    console.log("\n📤 Demo 2: Interactive Button");
    await pushCanvas(
      SESSION_ID,
      `
      <div style="text-align: center; padding: 40px;">
        <h2>Interactive Widget</h2>
        <button id="myButton" style="
          padding: 15px 30px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
        ">Click Me!</button>
        <p id="output" style="margin-top: 20px; font-size: 18px;"></p>
      </div>
      `,
      `
      let clicks = 0;
      document.getElementById('myButton').addEventListener('click', () => {
        clicks++;
        document.getElementById('output').textContent = 
          'Clicked ' + clicks + ' time' + (clicks !== 1 ? 's' : '');
      });
      `
    );
    await sleep(5000);
    
    // Demo 3: Data Table
    console.log("\n📤 Demo 3: Data Table");
    await pushCanvas(SESSION_ID, `
      <style>
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        th, td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #ddd;
        }
        th {
          background: #667eea;
          color: white;
          font-weight: 600;
        }
        tr:hover {
          background: #f5f5f5;
        }
      </style>
      <div style="padding: 20px;">
        <h2>📊 System Status</h2>
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Status</th>
              <th>Uptime</th>
              <th>Load</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>🚀 Web Server</td>
              <td><span style="color: #4caf50;">● Online</span></td>
              <td>99.9%</td>
              <td>42%</td>
            </tr>
            <tr>
              <td>🤖 Agent</td>
              <td><span style="color: #4caf50;">● Online</span></td>
              <td>99.8%</td>
              <td>35%</td>
            </tr>
            <tr>
              <td>💾 Database</td>
              <td><span style="color: #4caf50;">● Online</span></td>
              <td>100%</td>
              <td>28%</td>
            </tr>
            <tr>
              <td>🔌 WebSocket</td>
              <td><span style="color: #4caf50;">● Online</span></td>
              <td>99.7%</td>
              <td>15%</td>
            </tr>
          </tbody>
        </table>
      </div>
    `);
    await sleep(5000);
    
    // Demo 4: Form
    console.log("\n📤 Demo 4: Interactive Form");
    await pushCanvas(
      SESSION_ID,
      `
      <style>
        .form-container {
          max-width: 500px;
          margin: 0 auto;
          padding: 30px;
        }
        .form-group {
          margin-bottom: 20px;
        }
        label {
          display: block;
          margin-bottom: 5px;
          font-weight: 600;
          color: #333;
        }
        input, select, textarea {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }
        button {
          background: #667eea;
          color: white;
          padding: 12px 30px;
          border: none;
          border-radius: 4px;
          font-size: 16px;
          cursor: pointer;
          width: 100%;
        }
        button:hover {
          background: #5568d3;
        }
        .success {
          background: #4caf50;
          color: white;
          padding: 15px;
          border-radius: 4px;
          margin-top: 20px;
          display: none;
        }
      </style>
      <div class="form-container">
        <h2>📝 Feedback Form</h2>
        <form id="feedbackForm">
          <div class="form-group">
            <label>Name:</label>
            <input type="text" name="name" required>
          </div>
          <div class="form-group">
            <label>Email:</label>
            <input type="email" name="email" required>
          </div>
          <div class="form-group">
            <label>Rating:</label>
            <select name="rating">
              <option value="5">⭐⭐⭐⭐⭐ Excellent</option>
              <option value="4">⭐⭐⭐⭐ Good</option>
              <option value="3">⭐⭐⭐ Average</option>
              <option value="2">⭐⭐ Poor</option>
              <option value="1">⭐ Very Poor</option>
            </select>
          </div>
          <div class="form-group">
            <label>Comments:</label>
            <textarea name="comments" rows="4"></textarea>
          </div>
          <button type="submit">Submit Feedback</button>
        </form>
        <div class="success" id="successMessage">
          ✅ Thank you for your feedback!
        </div>
      </div>
      `,
      `
      document.getElementById('feedbackForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const data = new FormData(e.target);
        console.log('Form submitted:', Object.fromEntries(data));
        
        // Show success message
        document.getElementById('successMessage').style.display = 'block';
        e.target.style.display = 'none';
      });
      `
    );
    await sleep(5000);
    
    // Demo 5: Chart
    console.log("\n📤 Demo 5: SVG Chart");
    await pushCanvas(SESSION_ID, `
      <div style="padding: 30px;">
        <h2>📈 Monthly Sales</h2>
        <svg width="600" height="300" style="border: 1px solid #ddd; border-radius: 8px; padding: 20px;">
          <!-- Bar Chart -->
          <rect x="50" y="200" width="60" height="50" fill="#667eea" />
          <rect x="130" y="150" width="60" height="100" fill="#667eea" />
          <rect x="210" y="100" width="60" height="150" fill="#667eea" />
          <rect x="290" y="120" width="60" height="130" fill="#667eea" />
          <rect x="370" y="80" width="60" height="170" fill="#667eea" />
          <rect x="450" y="50" width="60" height="200" fill="#667eea" />
          
          <!-- Labels -->
          <text x="65" y="270" fill="#666" font-size="12">Jan</text>
          <text x="145" y="270" fill="#666" font-size="12">Feb</text>
          <text x="225" y="270" fill="#666" font-size="12">Mar</text>
          <text x="305" y="270" fill="#666" font-size="12">Apr</text>
          <text x="385" y="270" fill="#666" font-size="12">May</text>
          <text x="465" y="270" fill="#666" font-size="12">Jun</text>
          
          <!-- Grid lines -->
          <line x1="30" y1="250" x2="530" y2="250" stroke="#ddd" stroke-width="1"/>
          <line x1="30" y1="200" x2="530" y2="200" stroke="#ddd" stroke-width="1"/>
          <line x1="30" y1="150" x2="530" y2="150" stroke="#ddd" stroke-width="1"/>
          <line x1="30" y1="100" x2="530" y2="100" stroke="#ddd" stroke-width="1"/>
          <line x1="30" y1="50" x2="530" y2="50" stroke="#ddd" stroke-width="1"/>
        </svg>
      </div>
    `);
    
    console.log("\n✅ Demo complete!");
    
  } catch (error) {
    console.error("❌ Error:", error);
    console.log("\nMake sure:");
    console.log("1. The server is running");
    console.log(`2. A canvas client is connected at http://localhost:3000/canvas.html?session=${SESSION_ID}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run demo
demo().catch(console.error);
