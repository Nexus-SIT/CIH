import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:background_sms/background_sms.dart';
import 'dart:io' show Platform;

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Emergency Command Portal',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        primaryColor: const Color(0xFFFF453A),
        scaffoldBackgroundColor: const Color(0xFF0F172A), // Slate 900
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFFF453A),
          secondary: Color(0xFF30D5C8),
          surface: Color(0xFF1E293B), // Slate 800
        ),
        useMaterial3: true,
      ),
      home: const MainNavigationScreen(),
    );
  }
}

class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 0;
  late final WebViewController _webController;

  @override
  void initState() {
    super.initState();
    _requestLocationPermission();
    
    // Use the exposed network IP address of the Vite dev server
    _webController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setOnPermissionRequest((request) {
        request.grant();
      })
      ..loadRequest(Uri.parse('http://10.13.158.119:5173'));
  }

  Future<void> _requestLocationPermission() async {
    await Permission.locationWhenInUse.request();
  }

  @override
  Widget build(BuildContext context) {
    final List<Widget> pages = [
      SafeArea(child: WebViewWidget(controller: _webController)),
      const SmsDispatcherPage(),
    ];

    return Scaffold(
      body: pages[_currentIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) {
          setState(() {
            _currentIndex = index;
          });
        },
        backgroundColor: const Color(0xFF0F172A),
        selectedItemColor: const Color(0xFFFF453A),
        unselectedItemColor: Colors.grey,
        showSelectedLabels: true,
        showUnselectedLabels: true,
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.explore_outlined),
            activeIcon: Icon(Icons.explore),
            label: 'Portal',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.sms_outlined),
            activeIcon: Icon(Icons.sms),
            label: 'SMS Dispatch',
          ),
        ],
      ),
    );
  }
}

class SmsDispatcherPage extends StatefulWidget {
  const SmsDispatcherPage({super.key});

  @override
  State<SmsDispatcherPage> createState() => _SmsDispatcherPageState();
}

class _SmsDispatcherPageState extends State<SmsDispatcherPage> {
  final _phoneController = TextEditingController();
  final _messageController = TextEditingController(
    text: '[EMERGENCY ALERT] Severe flooding detected. Avoid Kasargod central junction and reroute to safe sector immediately.',
  );

  @override
  void dispose() {
    _phoneController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _sendSms() async {
    final number = _phoneController.text.trim();
    final message = _messageController.text;

    if (number.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a recipient phone number.')),
      );
      return;
    }

    // Direct background sending is supported only on Android
    if (Platform.isAndroid) {
      final status = await Permission.sms.request();
      if (status.isGranted) {
        try {
          final SmsStatus result = await BackgroundSms.sendMessage(
            phoneNumber: number,
            message: message,
          );
          if (result == SmsStatus.sent) {
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('SMS Alert sent successfully directly from this app!')),
              );
            }
            return;
          } else {
            throw Exception('SmsStatus returned: $result');
          }
        } catch (e) {
          debugPrint('Direct SMS sending failed, falling back: $e');
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('SMS permission denied. Falling back to messaging app.')),
          );
        }
      }
    }

    // Fallback: launch native SMS app (for iOS or if background SMS fails)
    final Uri smsLaunchUri = Uri(
      scheme: 'sms',
      path: number,
      queryParameters: <String, String>{
        'body': message,
      },
    );

    try {
      await launchUrl(smsLaunchUri);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error launching SMS composer: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('SMS Evacuation Dispatcher'),
        backgroundColor: const Color(0xFF0F172A),
        elevation: 0,
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(
              Icons.warning_amber_rounded,
              size: 64,
              color: Color(0xFFFF453A),
            ),
            const SizedBox(height: 16),
            const Text(
              'Offline Evacuation Dispatch',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'Quickly draft and broadcast emergency rerouting instructions via SMS to field responders and evacuees.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey[400], fontSize: 13),
            ),
            const SizedBox(height: 32),
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: 'Recipient Phone Number',
                hintText: 'e.g., +919876543210',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                prefixIcon: const Icon(Icons.phone),
                filled: true,
                fillColor: const Color(0xFF1E293B),
              ),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _messageController,
              maxLines: 5,
              decoration: InputDecoration(
                labelText: 'Alert Message Body',
                alignLabelWithHint: true,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                filled: true,
                fillColor: const Color(0xFF1E293B),
              ),
            ),
            const SizedBox(height: 32),
            ElevatedButton.icon(
              onPressed: _sendSms,
              icon: const Icon(Icons.send_rounded, color: Colors.white),
              label: const Text(
                'Send SMS Alert',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFFF453A),
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
