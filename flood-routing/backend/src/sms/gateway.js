import dotenv from 'dotenv';

dotenv.config();

export const sendSms = async (phone, message) => {
  const gatewayUrl = process.env.SMS_GATEWAY_URL;
  
  if (!gatewayUrl) {
    console.warn('[SMS Gateway Mock] SMS_GATEWAY_URL is not set.');
    console.log(`[SMS Gateway Mock] Sending to ${phone}: ${message}`);
    return true;
  }

  try {
    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ phone, message })
    });

    if (!response.ok) {
      console.error(`[SMS Gateway] Failed with status: ${response.status}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[SMS Gateway] Error sending SMS:', error);
    return false;
  }
};
