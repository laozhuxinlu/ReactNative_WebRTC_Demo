/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 * @flow
 */

import React, {
  Component
} from 'react';
import {
  AppRegistry,
  StyleSheet,
  Text,
  TextInput,
  TouchableHighlight,
  View,
  Platform
} from 'react-native';

//获取设备的屏幕大小
var Dimensions = require('Dimensions');
var myWidth = Dimensions.get('window').width;
var myHeight = Dimensions.get('window').height;
var myScale = Dimensions.get('window').scale;

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

//定义socket连接，相当于视频的中转，官网用的https://appr.tc
import io from 'socket.io-client';
const socket = io.connect('https://react-native-webrtc.herokuapp.com', {transports: ['websocket']});

//stun服务器，这里选择的是国内可以用的
// const configuration = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]};
const configuration = {"iceServers": [{"url": "stun:stun.ideasip.com"}]};

const pcPeers = {};
let localStream;

//执行io.connect 相对应的一些回调
socket.on('exchange', function(data){
  exchange(data);
});
socket.on('leave', function(socketId){
  leave(socketId);
});
//当连接上sock的时候执行，这里选择连接上sock以后初始化设备的摄像头进行取像
socket.on('connect', function(data) {
  log('socket.on --> connect');
  container.setState({info: 'Go Connect'});
  getLocalStream(true, function(stream) {
    localStream = stream;
    container.setState({videoURL: stream.toURL()});
    myFreshView();
  });
});

//获取摄像头取视频流的函数
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
        if (sourceInfo.kind == "video" && sourceInfo.facing == (isFront ? "front" : "back")) {
          videoSourceId = sourceInfo.id;
        }
      }
    });
  }

  getUserMedia({
    audio: true,
    video: {
      mandatory: {
        minWidth: 360, // Provide your own width, height and frame rate here
        minHeight: 640,
        minFrameRate: 3,
      },
      facingMode: (isFront ? "user" : "environment"),
      optional: (videoSourceId ? [{
        sourceId: videoSourceId
      }] : []),
    }
  }, function(stream) {
    //视频获取成功以后的回调
    log('getUserMedia success', stream);
    callback(stream);
  }, logError);
}

//用于验证getLocalStream()函数
function myConnectCamera() {
  getLocalStream(true, function(stream) {
    container.setState({videoURL: stream.toURL()});
  });
}

//创建房间并进入，如果房间已创建便直接进入
function enterTheRoom(roomID) {
  // body...
  socket.emit('join', roomID, function(socketIds){
    log('join' + socketIds);
    for (const i in socketIds) {
      const socketId = socketIds[i];
      createPC(socketId, true);
    }
  });
}

//重要的函数部分，通过RTCPeerConnection接口实现设备对接，且通过不同状态的回调做相应的处理
function createPC(socketId, isOffer) {
  // body...
  const pc = new RTCPeerConnection(configuration);
  pcPeers[socketId] = pc;

  pc.onicecandidate = function (event) {
    log('onicecandidate' +  event.candidate);
    if (event.candidate) {
      socket.emit('exchange', {'to': socketId, 'candidate': event.candidate });
    }
  };

  pc.onnegotiationneeded = function () {
    log('onnegotiationneeded');
    if (isOffer) {
      createOffer();
    }
  }

  function createOffer() {
    pc.createOffer(function(desc) {
      log('createOffer' +  desc);
      pc.setLocalDescription(desc, function () {
        log('setLocalDescription' + pc.localDescription);
        socket.emit('exchange', {'to': socketId, 'sdp': pc.localDescription });
      }, logError);
    }, logError);
  }
  //该回调主要是状态改变时所主动触发，初始化完成/连接上/断开的状态监听都在这里可以实现
  pc.oniceconnectionstatechange = function(event) {
    log('oniceconnectionstatechange' + event.target.iceConnectionState);
    if (event.target.iceConnectionState === 'completed') {
      setTimeout(() => {
        getStats();
      }, 1000);
    }
    if (event.target.iceConnectionState === 'connected') {
      myFreshView();
       // createDataChannel();
    }
    if(event.target.iceConnectionState === 'disconnected'){
        console.log("Clay:: disconnected");
        if(container.state.info === "Now, You Can Talk..."){
          container.setState({info: 'Other Party Is Offline...'});
          container.setState({ifOther: false});
        }

    }
  };

  pc.onsignalingstatechange = function(event) {
    log('onsignalingstatechange' + event.target.signalingState);
  };
  //当有人进入房间的时候会在这里做回调处理
  pc.onaddstream = function (event) {
    log('onaddstream' + event.stream);
    container.setState({info: 'One peer join!'});
    container.setState({ifOther: true});
    const remoteList = container.state.remoteList;
    remoteList[socketId] = event.stream.toURL();
    container.setState({ remoteList: remoteList });
    myFreshView();
    setTimeout(() => {
      container.setState({info: 'Now, You Can Talk...'});
      }, 2000);
  };

  pc.onremovestream = function (event) {
    log('onremovestream' + event.stream);
  };

  pc.addStream(localStream);
  return pc;
}

function getStats() {
  const pc = pcPeers[Object.keys(pcPeers)[0]];
  if (pc.getRemoteStreams()[0] && pc.getRemoteStreams()[0].getAudioTracks()[0]) {
    const track = pc.getRemoteStreams()[0].getAudioTracks()[0];
    log('track', track);
    pc.getStats(track, function(report) {
      log('getStats report', report);
    }, logError);
  }
}

function exchange(data) {
  log("exchange");
  const fromId = data.from;
  let pc;
  if (fromId in pcPeers) {
    pc = pcPeers[fromId];
  } else {
    pc = createPC(fromId, false);
  }

  if (data.sdp) {
    console.log('exchange sdp', data);
    pc.setRemoteDescription(new RTCSessionDescription(data.sdp), function () {
      if (pc.remoteDescription.type == "offer")
        pc.createAnswer(function(desc) {
          console.log('createAnswer', desc);
          pc.setLocalDescription(desc, function () {
            console.log('setLocalDescription', pc.localDescription);
            socket.emit('exchange', {'to': fromId, 'sdp': pc.localDescription });
          }, logError);
        }, logError);
    }, logError);
  } else {
    console.log('exchange candidate', data);
    pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
}

//离开socket的时候做简单的析构处理
function leave(socketId) {
  log('socket.on --> leave', socketId);
  const pc = pcPeers[socketId];
  const viewIndex = pc.viewIndex;
  pc.close();
  delete pcPeers[socketId];

  const remoteList = container.state.remoteList;
  delete remoteList[socketId]
  container.setState({ remoteList: remoteList });
}

//这里是刷对方视频流的地方，通过这里获取并传到RTCView下显示
function mapHash(hash, func) {
  log("mapHash");
  const array = [];
  for (const key in hash) {
    const obj = hash[key];
    array.push(func(obj, key));
  }
  return array;
}

//Bug描述：当设备赋值Video控件视频流的时候时候发现视频没法刷出来
//解决方案： 添加/减少一个小View去刷新当前的页面便能解决
function myFreshView() {
  // body...
  setTimeout(() => {
    if(container.state.reFresh == false){
      container.setState({reFresh: true});
    }else{
      container.setState({reFresh: false});
    }
      }, 1500);
}

function logError(error) {
  console.log("Clay:: logError", error);
}

function log(message) {
  console.log("Clay:: ", message);
}

const ReactNative_WebRTC_Demo = React.createClass({

  //初始化
  getInitialState: function() {
    return {
      info: 'Initializing',
      videoURL: null,
      remoteList: {},
      reFresh: false,
      ifOther: false,
    };
  },

  componentDidMount: function() {
    container = this;
  },

  destructor: function(){
    console.log("Clay:: destructor");
  },
  //连接摄像头取视频流的测试
  _connect: function() {
    myConnectCamera();
  },
  //进入房间，默认房间号：1213
  _enterRoom: function() {
    // body...
    if(this.state.info === "Now, You Can Talk..."){
      log("do nothing");
    }
    if(this.state.info === "Go Connect"){
      log("_enterRoom");
      this.setState({info: 'Connecting... Wait For Others'});
      enterTheRoom('1213');
    }
  },

  //解决当对方离开的时候视频卡在对方最后离开的页面不动，这里选择直接销毁显示对方视频流的RTCView
  _mapHash_callback: function(remote, index) {
    // body...
    var othersView;
    if(this.state.ifOther){
      console.log("Clay:: _mapHash_callback --> true");
      return <RTCView key={index} streamURL={remote} style={styles.selfView_2}/>
    }else{
      return null
    }
  },
  //Bug描述：当设备赋值Video控件视频流的时候时候发现视频没法刷出来
  //解决方案： 添加/减少一个小View去刷新当前的页面便能解决
  _freashView() {
    return (
      <View style={styles.freshView}>
      </View>
    );
  },

  render() {
    return (
      <View>

      {this.state.reFresh === true ? this._freashView():null}

      <View style={{flexDirection: 'row',marginTop: 10,justifyContent:'center',}}>

      <TouchableHighlight
            style={styles.connectStyle}
            onPress={this._enterRoom}>
            <Text style={{fontSize: 20,}}>{this.state.info}</Text>
      </TouchableHighlight>
      </View>

      <View style={{marginTop:1,}}>
       {
          mapHash(this.state.remoteList, this._mapHash_callback)
       }
        <RTCView streamURL={this.state.videoURL} style={styles.selfView}>
        </RTCView>
      </View>

      </View>

    );
  }
});

const styles = StyleSheet.create({
  connectStyle: {
    width: myWidth,
    height: 30,
    borderWidth: 1,
    borderColor: 'gray',
    flexDirection: 'row',
    justifyContent:'center',
  },
  selfView: {
    width: myWidth,
    height: myHeight/2,
  },
  selfView_2: {
    width: myWidth,
    height: myHeight/2,
  },
  freshView: {
    height: 2,
  },
});

AppRegistry.registerComponent('ReactNative_WebRTC_Demo', () => ReactNative_WebRTC_Demo);
