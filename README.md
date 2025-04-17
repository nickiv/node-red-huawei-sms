# Node-RED Huawei LTE USB Stick SMS Module

![image of example flow](./examples/flow-screenshot.jpg) ![image of Huawei LTE USB Stick](./examples/h3372-raspi.jpg)

## Overview

This module provides nodes that enable the sending and receiving of SMS messages using the Huawei LTE USB Stick E3372 in a Node-RED environment.

To use this module, ensure that the USB stick is connected to a computer running Node-RED as a network adapter. The module sends commands for sending or receiving SMS via HTTP requests to the integrated web server of the USB stick.

For proper functioning, you need to provide the password for the web admin interface of the USB stick.

During the development of this module, I conducted research on how the web admin interface works, leveraging browser inspector tools. Although I couldn't find an official API, I discovered helpful projects on GitHub. The most challenging aspect was implementing the authorization process.

The code of the module is structured to maintain only one session with each stick at any given moment. All requests are executed in sequence to prevent potential issues. It was observed that multiple sessions or simultaneous requests could lead to problems, such as an authorization request failure with the message "Already authorized."

You can use this module to:

- Forward SMS to email or Telegram or whatever channel Node-RED can use
- Send SMS notifications from Node-RED flows
- Receive SMS commands in Node-RED flows
- Send arbituary API requests to device

I tested this module for several months on couple of devices E3372h-320 with firmware 11.0.1.1(H697SP1C00). I consider it to be fairly reliable for home use. It is possible that it will work with other devices which run the same integrated web server (called HiLink).

For clarity I'm not related in any way with Huawei.

### Compatible devices

This module also works fine with other Huawei devices:
* E8231s-2
* E8372


## Install

```
$ npm install @nickiv/node-red-huawei-sms
```

## Usage

### Receive SMS

To receive an SMS drag Receive SMS node to flow. Add SMS config node or select the one you set up earlier. Upon receiving an SMS node will emit an object containing message with some metadata. New messages are checked every 5 seconds. Received messages are being deleted from Inbox of the stick. When flow starts all messages that are currently in the Inbox will be emitted.

### Send SMS

To send an SMS drag Send SMS node to flow. Add SMS config node or select the one you set up earlier. Specify target phone number in the node properties. Upon receiving a message with string payload, node will try to send it as SMS to specified target phone. Result of the operation will be set as message payload on output.

Sent messages are being deleted from Outbox of the stick.

### Generic API Request

The Generic API Request node allows you to send custom requests to a device's API. The module handles authentication and session management for you. Examples of available API requests can be found [here](https://github.com/Salamek/huawei-lte-api/blob/master/huawei_lte_api/api/Monitoring.py).

Please note that not all requests are compatible with every device, so you'll need to experiment to find what works for yours. Keep in mind that POST requests must include an XML body with a root `<request>` element. The API response will also be in XML format, so it's recommended to pair this node with the XML node for processing.

![image of example flow with Generic API Request](./examples/flow-generic.png)

For example, you can use the Generic API Request node to:
- Retrieve signal strength via GET device/status.
- Check traffic counters via GET monitoring/traffic-statistics.


## Feedback

If something doesn’t work as expected or you have suggestions for improvements, feel free to open a Pull Request. Your contributions are always welcome!