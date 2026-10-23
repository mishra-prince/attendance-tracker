#!/usr/bin/env python3
"""User-run provisioning; prompts keep Wi-Fi and reader keys out of shell history."""
import argparse
import getpass
import json
import re
import time
import uuid
from urllib.parse import urlsplit
import serial
from serial.tools import list_ports

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port')
    parser.add_argument('--status', action='store_true')
    args = parser.parse_args()
    port = args.port
    if not port:
        ports = [p.device for p in list_ports.comports() if p.vid is not None]
        if len(ports) != 1:
            raise ValueError('Specify --port. USB serial ports: ' + ', '.join(ports))
        port = ports[0]
    command = {'command': 'status'}
    if not args.status:
        print('Use the reader ID and one-time key from Threshold → Students, cards & readers.')
        ssid = input('2.4 GHz Wi-Fi name: ').strip()
        password = getpass.getpass('Wi-Fi password (hidden): ')
        reader_id = input('Reader ID: ').strip()
        uuid.UUID(reader_id)
        key = getpass.getpass('Reader key (hidden): ').strip()
        server = input('HTTPS API origin [https://att.threshold.dpdns.org]: ').strip().rstrip('/') or 'https://att.threshold.dpdns.org'
        url = urlsplit(server)
        if not ssid or len(ssid.encode()) > 32 or len(password.encode()) > 63 or not re.fullmatch(r'[A-Za-z0-9_-]{40,128}', key):
            raise ValueError('Invalid Wi-Fi or reader credential')
        if url.scheme != 'https' or not url.hostname or url.username or url.password or url.path or url.query or url.fragment or len(server) > 200:
            raise ValueError('Use a valid HTTPS origin with no path or credentials')
        command = {'command': 'configure', 'ssid': ssid, 'password': password, 'readerId': reader_id, 'key': key, 'server': server}
    # Only the human running this tool opens the serial device. No secrets are logged.
    with serial.Serial(port, 115200, timeout=0.5, write_timeout=3) as connection:
        time.sleep(2)
        connection.reset_input_buffer()
        connection.write((json.dumps(command)+'\n').encode())
        connection.flush()
        deadline = time.monotonic()+12
        confirmed = False
        while time.monotonic() < deadline:
            line = connection.readline().decode('utf-8', errors='replace').strip()
            if args.status and line.startswith('{'):
                state=json.loads(line)
                print(json.dumps({k: state.get(k) for k in ['configured','wifi_connected','reader_healthy','reader_id','server','pending_delivery']}, indent=2))
                return
            if line.startswith('Configuration saved privately.'):
                confirmed=True
                break
            if line.startswith('Invalid configuration'):
                raise ValueError('Firmware rejected configuration; no success confirmed')
        if not confirmed:
            raise RuntimeError('No configuration acknowledgement. Check the port, press RESET and retry. No success confirmed.')
        print('Configuration acknowledged. Run this tool with --status after the reader restarts, then test a supervised card tap.')

if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        raise SystemExit('STOPPED: '+str(error))
