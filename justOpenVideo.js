/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 * @flow
 */

import React, { Component } from 'react';
import {
  AppRegistry,
  StyleSheet,
  Text,
  TextInput,
  TouchableHighlight,
  View,
  Platform
} from 'react-native';

var WebRTC = require('react-native-webrtc');

var {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  MediaStream,
  MediaStreamTrack,
  getUserMedia,
} = WebRTC;

function getLocalStream(isFront, callback) {
  log('getLocalStream');

  let videoSourceId;

  //on android, you don't have to specify sourceId manually, just use facingMode
  //uncomment it if you want to specify
  if (Platform.OS === 'ios') {
    MediaStreamTrack.getSources(sourceInfos => {
      console.log("sourceInfos: ", sourceInfos);

      for (const i = 0; i < sourceInfos.length; i++) {
        const sourceInfo = sourceInfos[i];
        if(sourceInfo.kind == "video" && sourceInfo.facing == (isFront ? "front" : "back")) {
          videoSourceId = sourceInfo.id;
        }
      }
    });
  }

//   MediaStreamTrack.getSources(sourceInfos => {
//     log('MediaStreamTrack.getSources');
//   let videoSourceId;
//   for (const i = 0; i < sourceInfos.length; i++) {
//     const sourceInfo = sourceInfos[i];
//     if(sourceInfo.kind == "video" && sourceInfo.facing == (isFront ? "front" : "back")) {
//       videoSourceId = sourceInfo.id;
//     }
//   }
// });

  getUserMedia({
    audio: false,
    video: {
      mandatory: {
        minWidth: 640, // Provide your own width, height and frame rate here
        minHeight: 360,
        minFrameRate: 30,
      },
      facingMode: (isFront ? "user" : "environment"),
      optional: (videoSourceId ? [{sourceId: videoSourceId}] : []),
    }
  }, function (stream) {
    log('getUserMedia success', stream);
    callback(stream);
  }, logError);

}

function myConnect() {
  console.log('connect');
  getLocalStream(true, function(stream) {
    log("callback successful");
    container.setState({videoURL: stream.toURL()});
  });
}

function logError(error) {
  console.log("Clay:: logError", error);
}
function log(message) {
  console.log("Clay:: ", message);
}

const ReactNative_WebRTC_Demo = React.createClass({

  getInitialState: function() {
    return {videoURL: null};
  },
  componentDidMount: function() {
    container = this;
  },

  _connect: function() {
    myConnect();
  },

  render() {
    return (
      <View>
      <RTCView streamURL={this.state.videoURL} style={styles.selfView}>
      </RTCView>

       <TouchableHighlight
            style={styles.connectStyle}
            onPress={this._connect}>
            <Text>Connect</Text>
        </TouchableHighlight>

        <TextInput style={styles.testInputStyle}>
        </TextInput>

      </View>
    );
  }
}
);

const styles = StyleSheet.create({
  testInputStyle: {
    width: 200,
    height: 40,
    borderColor: 'gray',
  },
  connectStyle: {
    width: 70,
    height: 30,
    borderWidth: 1,
  },
  selfView: {
    width: 380,
    height: 450,
  },
});

AppRegistry.registerComponent('ReactNative_WebRTC_Demo', () => ReactNative_WebRTC_Demo);
