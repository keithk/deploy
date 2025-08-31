# 🏗️ Action-Based Sites

You can create sites that are primarily or entirely driven by actions. This approach is useful for:

- **API-only sites**: Create a site that only exposes API endpoints
- **Scheduled tasks**: Run periodic jobs without a frontend
- **Integration hubs**: Connect different services and systems
- **Data processing pipelines**: Process and transform data on a schedule

## Example: API-Only Site

```typescript
// sites/api-site/.dialup/actions/api-endpoints.ts
import { defineRouteAction } from "@@keithk/deploy";

export default defineRouteAction({
  id: "api-endpoints",
  routes: [
    {
      path: "/api/users",
      method: "GET",
      handler: async (request, context) => {
        // Fetch users from a database
        const users = [
          /* ... */
        ];

        return new Response(JSON.stringify({ users }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    },
    {
      path: "/api/users",
      method: "POST",
      handler: async (request, context) => {
        // Create a new user
        const data = await request.json();

        // Save to database
        // ...

        return new Response(JSON.stringify({ success: true }), {
          status: 201,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  ]
});
```

## Example: Data Processing Site

```typescript
// sites/data-processor/.dialup/actions/process-data.ts
import { defineScheduledAction } from "@@keithk/deploy";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

export default defineScheduledAction({
  id: "process-data",
  schedule: "*/30 * * * *", // Run every 30 minutes
  async handler(payload, context) {
    const sitePath = context.site?.path || "";

    // Read input data
    const inputPath = join(sitePath, "data/input.json");
    const inputData = JSON.parse(await readFile(inputPath, "utf-8"));

    // Process data
    const processedData = inputData.map((item) => ({
      ...item,
      processed: true,
      timestamp: new Date().toISOString()
    }));

    // Write output data
    const outputPath = join(sitePath, "data/output.json");
    await writeFile(
      outputPath,
      JSON.stringify(processedData, null, 2),
      "utf-8"
    );

    return {
      success: true,
      message: `Processed ${inputData.length} items`,
      data: {
        itemCount: inputData.length
      }
    };
  }
});
```

## Example: Integration Hub

```typescript
// sites/integration-hub/.dialup/actions/github-to-slack.ts
import { defineWebhookAction } from "@@keithk/deploy";

export default defineWebhookAction({
  id: "github-to-slack",
  path: "/webhook/github",
  async handler(payload, context) {
    // Get Slack webhook URL from environment variables
    const slackWebhookUrl = context.env?.SLACK_WEBHOOK_URL;

    if (!slackWebhookUrl) {
      return {
        success: false,
        message: "Slack webhook URL not configured"
      };
    }

    // Process GitHub webhook
    const event = payload.headers["x-github-event"];
    const data = payload.body;

    // Format message for Slack based on GitHub event
    let message = "";
    let color = "#36a64f"; // Default green color

    if (event === "push") {
      const repo = data.repository.full_name;
      const branch = data.ref.replace("refs/heads/", "");
      const commits = data.commits.length;
      const pusher = data.pusher.name;

      message = `*${pusher}* pushed ${commits} commit(s) to *${repo}* on branch *${branch}*`;

      // Add commit details
      const commitList = data.commits
        .map((commit) => {
          return `• <${commit.url}|${commit.id.substring(0, 7)}>: ${
            commit.message
          } - ${commit.author.name}`;
        })
        .join("\n");

      message += `\n${commitList}`;
    } else if (event === "pull_request") {
      const action = data.action;
      const repo = data.repository.full_name;
      const pr = data.pull_request;
      const user = data.sender.login;

      message = `*${user}* ${action} a pull request in *${repo}*: <${pr.html_url}|#${pr.number} ${pr.title}>`;

      if (action === "opened" || action === "reopened") {
        color = "#36a64f"; // Green
      } else if (action === "closed") {
        color = pr.merged ? "#6f42c1" : "#cb2431"; // Purple if merged, red if closed
      }
    } else if (event === "issues") {
      const action = data.action;
      const repo = data.repository.full_name;
      const issue = data.issue;
      const user = data.sender.login;

      message = `*${user}* ${action} an issue in *${repo}*: <${issue.html_url}|#${issue.number} ${issue.title}>`;

      if (action === "opened" || action === "reopened") {
        color = "#36a64f"; // Green
      } else if (action === "closed") {
        color = "#cb2431"; // Red
      }
    }

    // Skip if no message was formatted
    if (!message) {
      return {
        success: true,
        message: `Ignored GitHub event: ${event}`
      };
    }

    // Send to Slack
    try {
      const response = await fetch(slackWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          attachments: [
            {
              color: color,
              text: message,
              footer: "GitHub Integration",
              ts: Math.floor(Date.now() / 1000)
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Slack API returned ${response.status}`);
      }

      return {
        success: true,
        message: `Sent GitHub ${event} event to Slack`,
        data: { event }
      };
    } catch (error) {
      console.error("Failed to send to Slack:", error);

      return {
        success: false,
        message: `Failed to send to Slack: ${error.message}`,
        data: { error: error.message }
      };
    }
  }
});
```

## Example: Scheduled Report Generator

```typescript
// sites/reports/.dialup/actions/weekly-report.ts
import { defineScheduledAction } from "@@keithk/deploy";
import { writeFile } from "fs/promises";
import { join } from "path";
import nodemailer from "nodemailer";

export default defineScheduledAction({
  id: "weekly-report",
  schedule: "0 9 * * 1", // Run at 9 AM every Monday
  async handler(payload, context) {
    // Get email configuration from environment variables
    const emailFrom = context.env?.EMAIL_FROM;
    const emailTo = context.env?.EMAIL_TO;
    const smtpHost = context.env?.SMTP_HOST;
    const smtpPort = parseInt(context.env?.SMTP_PORT || "587");
    const smtpUser = context.env?.SMTP_USER;
    const smtpPass = context.env?.SMTP_PASS;

    if (!emailFrom || !emailTo || !smtpHost || !smtpUser || !smtpPass) {
      return {
        success: false,
        message: "Email configuration missing"
      };
    }

    try {
      // Generate report data
      const reportData = await generateWeeklyReport(context);

      // Save report to file
      const sitePath = context.site?.path || "";
      const reportsDir = join(sitePath, "reports");
      const reportPath = join(
        reportsDir,
        `weekly-report-${new Date().toISOString().split("T")[0]}.json`
      );

      await writeFile(reportPath, JSON.stringify(reportData, null, 2), "utf-8");

      // Create HTML report
      const htmlReport = generateHtmlReport(reportData);

      // Send email
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      const info = await transporter.sendMail({
        from: emailFrom,
        to: emailTo,
        subject: `Weekly Report - ${new Date().toISOString().split("T")[0]}`,
        html: htmlReport,
        attachments: [
          {
            filename: "weekly-report.json",
            content: JSON.stringify(reportData, null, 2)
          }
        ]
      });

      return {
        success: true,
        message: `Weekly report sent to ${emailTo}`,
        data: {
          messageId: info.messageId,
          reportPath
        }
      };
    } catch (error) {
      console.error("Failed to generate or send report:", error);

      return {
        success: false,
        message: `Report generation failed: ${error.message}`,
        data: { error: error.message }
      };
    }
  }
});

// Helper function to generate report data
async function generateWeeklyReport(context) {
  // This would typically fetch data from databases, APIs, etc.
  return {
    date: new Date().toISOString(),
    metrics: {
      users: 1250,
      newUsers: 120,
      activeUsers: 850,
      revenue: 12500.75,
      transactions: 450
    },
    topProducts: [
      { id: "prod-1", name: "Product A", sales: 125 },
      { id: "prod-2", name: "Product B", sales: 98 },
      { id: "prod-3", name: "Product C", sales: 76 }
    ],
    weekOverWeek: {
      users: "+5.2%",
      revenue: "+3.8%",
      transactions: "+2.1%"
    }
  };
}

// Helper function to generate HTML report
function generateHtmlReport(data) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        .metrics { display: flex; justify-content: space-between; margin: 20px 0; }
        .metric { text-align: center; padding: 15px; background: #f9f9f9; border-radius: 5px; }
        .metric h3 { margin: 0; color: #555; }
        .metric p { font-size: 24px; font-weight: bold; margin: 10px 0; }
        .metric small { color: green; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Weekly Report - ${new Date(data.date).toLocaleDateString()}</h1>
        
        <div class="metrics">
          <div class="metric">
            <h3>Users</h3>
            <p>${data.metrics.users.toLocaleString()}</p>
            <small>${data.weekOverWeek.users}</small>
          </div>
          <div class="metric">
            <h3>New Users</h3>
            <p>${data.metrics.newUsers.toLocaleString()}</p>
          </div>
          <div class="metric">
            <h3>Revenue</h3>
            <p>$${data.metrics.revenue.toLocaleString()}</p>
            <small>${data.weekOverWeek.revenue}</small>
          </div>
          <div class="metric">
            <h3>Transactions</h3>
            <p>${data.metrics.transactions.toLocaleString()}</p>
            <small>${data.weekOverWeek.transactions}</small>
          </div>
        </div>
        
        <h2>Top Products</h2>
        <table>
          <tr>
            <th>Product</th>
            <th>Sales</th>
          </tr>
          ${data.topProducts
            .map(
              (product) => `
            <tr>
              <td>${product.name}</td>
              <td>${product.sales}</td>
            </tr>
          `
            )
            .join("")}
        </table>
      </div>
    </body>
    </html>
  `;
}
```

## Best Practices for Action-Based Sites

1. **Organize Actions Logically**: Group related actions together and use clear naming conventions
2. **Error Handling**: Implement robust error handling and logging
3. **Environment Variables**: Store sensitive information in environment variables
4. **Documentation**: Document your API endpoints and scheduled tasks
5. **Monitoring**: Set up monitoring for your action-based sites to track performance and errors
6. **Testing**: Create tests for your actions to ensure they work as expected
7. **Security**: Implement proper authentication and authorization for API endpoints

## Related Documentation

- [Scheduled Actions](./scheduled-actions.md)
- [Webhook Actions](./webhook-actions.md)
- [Route Actions](./route-actions.md)
- [Hook Actions](./hook-actions.md)
- [Custom Actions](./custom-actions.md)
