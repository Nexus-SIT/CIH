import { sendSms } from './gateway.js';
import { formatInstructionMessage } from './formatter.js';

export const sendRouteInstruction = async (phone, instruction, route_id) => {
  const message = formatInstructionMessage(instruction, route_id);
  const success = await sendSms(phone, message);
  if (!success) {
    return { success: false, error: 'Failed to send SMS via gateway' };
  }
  return { success: true };
};
