import 'package:flutter/material.dart';
import 'package:telephony/telephony.dart';

@pragma('vm:entry-point')
void backgoundMessageHandler(SmsMessage message) {
  debugPrint("Background SMS from ${message.address}: ${message.body}");
  // Note: Since this runs in a separate isolate, directly updating main UI state isn't possible.
  // In a production app, you would use a local database (like Hive/Sqflite) or shared preferences
  // to save this message, then reload it in the UI.
}

void main() {
  runApp(const SMSRelayApp());
}

class SMSRelayApp extends StatelessWidget {
  const SMSRelayApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SMS Relay',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF0F172A), // Slate 900
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFEF4444), // Red 500 (emergency feel)
          secondary: Color(0xFF10B981), // Emerald 500
          surface: Color(0xFF1E293B), // Slate 800
        ),
        cardTheme: const CardTheme(
          color: Color(0xFF1E293B),
          elevation: 2,
        ),
      ),
      home: const SMSDashboard(),
    );
  }
}

class SMSDashboard extends StatefulWidget {
  const SMSDashboard({super.key});

  @override
  State<SMSDashboard> createState() => _SMSDashboardState();
}

class _SMSDashboardState extends State<SMSDashboard> {
  final Telephony telephony = Telephony.instance;
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _messageController = TextEditingController();
  
  bool _permissionsGranted = false;
  final List<SmsMessage> _receivedMessages = [];
  String _sendStatusMessage = "";
  bool _isSending = false;

  @override
  void initState() {
    super.initState();
    _checkAndRequestPermissions();
  }

  Future<void> _checkAndRequestPermissions() async {
    final bool? result = await telephony.requestPhoneAndSmsPermissions;
    if (result != null && result) {
      setState(() {
        _permissionsGranted = true;
      });
      _startListening();
    } else {
      setState(() {
        _permissionsGranted = false;
      });
    }
  }

  void _startListening() {
    telephony.listenIncomingSms(
      onNewMessage: (SmsMessage message) {
        setState(() {
          _receivedMessages.insert(0, message); // Add to the top
        });
      },
      onBackgroundMessage: backgoundMessageHandler,
    );
  }

  Future<void> _sendSMS() async {
    final phone = _phoneController.text.trim();
    final message = _messageController.text.trim();

    if (phone.isEmpty || message.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please enter both phone number and message.")),
      );
      return;
    }

    setState(() {
      _isSending = true;
      _sendStatusMessage = "Sending...";
    });

    try {
      await telephony.sendSms(
        to: phone,
        message: message,
        statusListener: (SendStatus status) {
          setState(() {
            if (status == SendStatus.SENT) {
              _sendStatusMessage = "SMS Sent Successfully!";
              _messageController.clear();
            } else if (status == SendStatus.DELIVERED) {
              _sendStatusMessage = "SMS Delivered!";
            } else {
              _sendStatusMessage = "Failed to send SMS.";
            }
            _isSending = false;
          });
        },
      );
    } catch (e) {
      setState(() {
        _sendStatusMessage = "Error sending SMS: $e";
        _isSending = false;
      });
    }
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          "SMS RELAY DASHBOARD",
          style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 1.2, fontSize: 18),
        ),
        backgroundColor: const Color(0xFF0F172A),
        elevation: 0,
        actions: [
          IconButton(
            icon: Icon(
              _permissionsGranted ? Icons.verified : Icons.warning_amber_rounded,
              color: _permissionsGranted ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
            ),
            onPressed: _checkAndRequestPermissions,
            tooltip: _permissionsGranted ? "Permissions Active" : "Grant Permissions",
          )
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (!_permissionsGranted) ...[
                Card(
                  color: const Color(0xFF7F1D1D), // Dark Red
                  child: Padding(
                    padding: const EdgeInsets.all(12.0),
                    child: Column(
                      children: [
                        const Text(
                          "Permissions Required!",
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          "This app requires SMS permissions to send and receive messages programmatically.",
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 13, color: Color(0xFFFECACA)),
                        ),
                        const SizedBox(height: 12),
                        ElevatedButton(
                          onPressed: _checkAndRequestPermissions,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.white,
                            foregroundColor: Colors.black,
                          ),
                          child: const Text("GRANT PERMISSIONS"),
                        )
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
              ],
              
              // SEND SMS SECTION
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        "SEND OUTGOING SMS",
                        style: TextStyle(
                          fontSize: 14, 
                          fontWeight: FontWeight.bold,
                          color: Color(0xFFEF4444),
                          letterSpacing: 1.1,
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _phoneController,
                        keyboardType: TextInputType.phone,
                        decoration: InputDecoration(
                          hintText: "Recipient Phone Number (+1234567890)",
                          prefixIcon: const Icon(Icons.phone),
                          filled: true,
                          fillColor: const Color(0xFF0F172A),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: BorderSide.none,
                          ),
                          contentPadding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _messageController,
                        maxLines: 2,
                        decoration: InputDecoration(
                          hintText: "Enter SMS message text here...",
                          prefixIcon: const Icon(Icons.message),
                          filled: true,
                          fillColor: const Color(0xFF0F172A),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: BorderSide.none,
                          ),
                          contentPadding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.between,
                        children: [
                          Expanded(
                            child: Text(
                              _sendStatusMessage,
                              style: TextStyle(
                                fontSize: 12, 
                                color: _sendStatusMessage.contains("Successfully") || _sendStatusMessage.contains("Delivered") 
                                  ? const Color(0xFF10B981) 
                                  : Colors.orange,
                              ),
                            ),
                          ),
                          ElevatedButton.icon(
                            onPressed: _isSending || !_permissionsGranted ? null : _sendSMS,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFFEF4444),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            icon: _isSending 
                              ? const SizedBox(
                                  width: 16, 
                                  height: 16, 
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)
                                )
                              : const Icon(Icons.send),
                            label: const Text("SEND SMS"),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              
              // RECEIVED SMS SECTION
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8.0, horizontal: 4.0),
                child: Text(
                  "RECEIVED SMS LOGS",
                  style: TextStyle(
                    fontSize: 14, 
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF10B981),
                    letterSpacing: 1.1,
                  ),
                ),
              ),
              Expanded(
                child: _receivedMessages.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.sms_failed_outlined, size: 48, color: Colors.slate[600]),
                          const SizedBox(height: 8),
                          Text("No messages received yet.", style: TextStyle(color: Colors.slate[500])),
                          const SizedBox(height: 4),
                          Text("Send an SMS to this device to see it here.", 
                            style: TextStyle(color: Colors.slate[600], fontSize: 12),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    )
                  : ListView.builder(
                      itemCount: _receivedMessages.length,
                      itemBuilder: (context, index) {
                        final msg = _receivedMessages[index];
                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: ListTile(
                            leading: const CircleAvatar(
                              backgroundColor: Color(0xFF0F172A),
                              child: Icon(Icons.comment, color: Color(0xFF10B981), size: 20),
                            ),
                            title: Text(
                              msg.address ?? "Unknown Sender",
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                            ),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const SizedBox(height: 4),
                                Text(msg.body ?? "", style: const TextStyle(color: Colors.white70)),
                                const SizedBox(height: 6),
                                if (msg.date != null)
                                  Text(
                                    DateTime.fromMillisecondsSinceEpoch(msg.date!).toString().substring(0, 19),
                                    style: TextStyle(color: Colors.slate[500], fontSize: 10),
                                  ),
                              ],
                            ),
                            isThreeLine: true,
                          ),
                        );
                      },
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
