# Automated Lead Calling System with AI Analysis

An intelligent n8n workflow that automates lead calling and uses AI to analyze call transcripts for lead qualification.

## 🚀 Overview

This workflow creates a fully automated lead management system that:
- Monitors a Google Sheets document for new leads
- Automatically makes phone calls using Vapi.ai
- Analyzes call transcripts using Google Gemini AI
- Updates the sheet with AI-extracted insights
- Provides real-time lead qualification

## 📋 Prerequisites

Before setting up this workflow, ensure you have:

- **n8n Account**: Access to n8n (self-hosted or cloud)
- **Google Sheets API**: Access to Google Sheets with OAuth2 credentials
- **Vapi.ai Account**: API access for automated calling
- **Google Gemini API**: Access to Google's AI model for text analysis

## 🔧 Required Credentials

### 1. Google Sheets Credentials
- **Google Sheets Trigger OAuth2**: For monitoring sheet changes
- **Google Sheets OAuth2**: For updating sheet data

### 2. Vapi.ai Credentials
- **HTTP Header Auth**: For API authentication
- Required headers: Authorization token

### 3. Google Gemini Credentials
- **Google Gemini API Key**: For AI text analysis

## 📊 Google Sheets Structure

Your Google Sheet should have the following columns:
- **Name**: Lead's name
- **Phone**: Phone number to call
- **Status**: Current status (e.g., "Not Called", "Called", "Completed")
- **Remarks**: Additional notes
- **text**: AI analysis results (auto-populated)

## 🔄 Workflow Steps

### 1. Trigger & Monitoring
- **Google Sheets Trigger**: Monitors sheet every minute for new rows
- **Filter**: Processes only rows with Status = "Not Called"

### 2. Call Execution
- **Loop Over Items**: Processes each lead individually
- **Calling Node**: Initiates call via Vapi.ai API
- **Wait**: 30-second pause after call initiation
- **Status Check**: Polls call status until completion

### 3. Data Processing
- **Extract Data**: Pulls key information from call response:
  - Transcript
  - Summary
  - Visit date
  - Interest level
  - Notes
- **Condition Check**: Proceeds only if call status = "ended"

### 4. AI Analysis
- **Google Gemini**: Analyzes call summary
- **LLM Chain**: Extracts important keywords and insights
- **Fallback**: Returns "call not placed" if no summary available

### 5. Data Update
- **Sheet Update**: Appends AI analysis to the "text" column

## 🛠️ Setup Instructions

### Step 1: Import Workflow
1. Open your n8n instance
2. Click "Import from file"
3. Upload `My_workflow_5.json`

### Step 2: Configure Credentials
1. **Google Sheets Trigger**:
   - Set up OAuth2 credentials
   - Select your target Google Sheet
   - Choose the sheet tab to monitor

2. **Vapi.ai API**:
   - Configure HTTP Header Auth
   - Add your Vapi.ai API token
   - Update phone number ID and assistant ID in the calling node

3. **Google Gemini**:
   - Set up Google Gemini API credentials
   - Ensure API key has proper permissions

### Step 3: Customize Configuration
1. **Sheet ID**: Update the Google Sheets document ID
2. **Phone Number ID**: Set your Vapi.ai phone number ID
3. **Assistant ID**: Configure your Vapi.ai assistant ID
4. **Polling Frequency**: Adjust the trigger timing if needed

### Step 4: Test the Workflow
1. Add a test row to your Google Sheet
2. Set Status to "Not Called"
3. Activate the workflow
4. Monitor execution in n8n

## 📈 Usage

### Adding New Leads
1. Add a new row to your Google Sheet
2. Fill in Name and Phone columns
3. Set Status to "Not Called"
4. The workflow will automatically process the lead

### Monitoring Progress
- Check the "Status" column for call progress
- Review "text" column for AI analysis results
- Monitor n8n execution logs for any errors

### Customizing AI Analysis
Modify the LLM Chain prompt in the "Basic LLM Chain" node to:
- Extract specific information
- Change analysis criteria
- Add custom keywords

## 🔍 Troubleshooting

### Common Issues

1. **Authentication Errors**:
   - Verify all credentials are properly configured
   - Check API key permissions
   - Ensure OAuth2 tokens are valid

2. **Call Failures**:
   - Verify phone number format
   - Check Vapi.ai account status
   - Review API rate limits

3. **Sheet Access Issues**:
   - Ensure Google Sheets permissions
   - Verify sheet ID is correct
   - Check OAuth2 scope includes sheets access

4. **AI Analysis Issues**:
   - Verify Gemini API key
   - Check API quota limits
   - Review prompt formatting

### Debug Mode
Enable debug mode in n8n to:
- View detailed execution logs
- Monitor data flow between nodes
- Identify specific failure points

## 📝 Configuration Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `phoneNumberId` | Vapi.ai phone number identifier | `f0869a86-e476-4694-90ac-e675f2e465c0` |
| `assistantId` | Vapi.ai assistant identifier | `3ada27e0-1ea7-4816-98ee-bfdc32a04861` |
| `documentId` | Google Sheets document ID | `1V-Waz-V3z5taFiMd37k-c5jiCyBu_Kd8J2XW-N1ELWA` |
| `waitTime` | Delay after call initiation (seconds) | `30` |

## 🔒 Security Considerations

- Store API keys securely in n8n credentials
- Use environment variables for sensitive data
- Regularly rotate API keys
- Monitor API usage and costs
- Implement proper access controls

## 📊 Performance Optimization

- Adjust polling frequency based on lead volume
- Implement batch processing for high-volume scenarios
- Monitor API rate limits
- Optimize AI prompt for faster processing

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:
- Check the troubleshooting section
- Review n8n documentation
- Contact Vapi.ai support for API issues
- Open an issue in this repository

## 📞 Contact

- **Author**: [Your Name]
- **Email**: [Your Email]
- **GitHub**: [Your GitHub Profile]

**Note**: Replace the placeholder information above with your actual details before pushing to GitHub.

---

**Note**: This workflow is designed for lead qualification and should be used in compliance with relevant telemarketing and privacy regulations in your jurisdiction. 