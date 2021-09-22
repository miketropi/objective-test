const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const {Server, Socket} = require('socket.io');
const io = new Server(server);
const q = require('./questions.json');

const shuffle = (array) => {
  let currentIndex = array.length,  randomIndex;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }

  return array;
}
const questions = shuffle(q);

global.io = io;

const TIME_FOR_EACH_LEVEL = 30;

let GameStart = false;
let Level = 0;
let TimerLevel = TIME_FOR_EACH_LEVEL;
let PreStart = 5;
let Users = [];
let QuestionLength = questions.length;
let _GameInterVal;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html')
})

app.get('/reset', (req, res) => {
  ResetGame();
  res.send('Reset Successful!')
} )

server.listen(3000, () => {
  console.log('App listening on port *:3000')
})

const ResetGame = () => {
  GameStart = false;
  Level = 0;
  TimerLevel = TIME_FOR_EACH_LEVEL;
  PreStart = 5;
  Users = [];
}

const findUserIndex = (uid) => {
  return Users.findIndex(u => {
    return u._id == uid
  })
}


const EndGame = () => {
  io.sockets.emit('EndGame', {
    Users: Users.sort((a, b) => {
      return b.point - a.point;
    }),
    QuestionLength
  })
}

const ListeningStartGame = (socket) => {
  if( _GameInterVal ) 
    clearInterval(_GameInterVal)

  _GameInterVal = setInterval(() => {
    if( !GameStart ) return;

    if(PreStart >= 0) {
      io.sockets.emit('__PreStart', {
        CountDown: PreStart
      })
      PreStart--
      return;
    }

    io.sockets.emit('GameTimer', {
      TimerLevel,
      Level,
      QuestionLength,
      question: questions[Level]
    })

    TimerLevel--
    if(TimerLevel < 0) {
      Level += 1;
      TimerLevel = TIME_FOR_EACH_LEVEL;
      UpdateUsersPoint();

      if(Level > (questions.length - 1)) {
        clearInterval(_GameInterVal)
        EndGame();
        ResetGame();
        return;
      }
    }
  }, 1000)
}

const UpdateUsersPoint = () => {
  Users.map( u => {
    let _a = u.answer;
    let TotalPoint = 0;
    for (const key in _a) {
      const QuestionItem = questions.find(q => {
        return q.key == key
      })

      if(QuestionItem.a.includes(_a[key])) {
        TotalPoint += 1
      }
    }

    return u.point = TotalPoint;
  } )

  io.sockets.emit('Users', Users);
}

io.on('connect', socket => {
  ListeningStartGame(socket)

  socket.on('ClientConnect', data => {

    if(GameStart) {
      return;
    }

    let index = Users.findIndex(u => {
      return u._id == data._id
    })

    if(index === -1) { Users.push({
      ...data,
      sid: socket.id,
      online: true,
      point: 0,
      answer: {},
      ready: false,
    });
    } else { Users[index] = {...Users[index], ...data, online: true, sid: socket.id}; }

    io.sockets.emit('Users', Users); 
  })

  const CheckReady = () => {
    let UserUnReady = Users.find(u => {
      return u.ready == false;
    })
    return !UserUnReady ? true : false;
  }

  socket.on('ImReady', data => { 
    if(GameStart) {
      return;
    }

    const _index = findUserIndex(data._id);
    Users[_index].ready = true;

    io.sockets.emit('Users', Users); 

    if(CheckReady()) {
      GameStart = true;
    }
  })

  socket.on('Anwser', ({UserID, QuestionKey, Value}) => {
    const _index = findUserIndex(UserID);
    Users[_index].answer[QuestionKey] = Value;
  })

  socket.on('disconnect', () => {
    let _index = Users.findIndex(u => {
      return socket.id === u.sid;
    })

    if(Users[_index]) {
      Users[_index].online = false;
    
      setTimeout(() => {
        if(Users[_index].online) return;

        Users.splice(_index, 1);

        if(GameStart) return;
        io.sockets.emit('Users', Users);
      }, 3000)
    }

    if(!GameStart) {
      io.sockets.emit('Users', Users);
    }
    console.log(`user disconnect!`)
  })
})