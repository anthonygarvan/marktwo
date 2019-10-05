import React from 'react';
import getGoogleApi from 'google-client-api';
import Page from './Page';
import './Splash.scss';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGoogle } from '@fortawesome/free-brands-svg-icons';


class Splash extends React.Component {
  constructor(props) {
    super(props);
    this.handleLogin = this.handleLogin.bind(this);
    this.handleLogout = this.handleLogout.bind(this);
    this.handleSwitchUser = this.handleSwitchUser.bind(this);
    this.state = {};
  }

  componentWillMount() {
    getGoogleApi().then(googleApi => {
            const gapi = googleApi;
            gapi.load('client:auth2', () => {

              const initSettings = {
                client_id: '346746556737-32h3br6e6beeerm71norabl2icv4rl7e.apps.googleusercontent.com',
                scope: 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
                response_type: 'id_token permission'}

              gapi.auth2.init(initSettings).then(() => {
                  let isAuthenticated = gapi.auth2.getAuthInstance().isSignedIn.get();
                  this.setState({ isAuthenticated, gapi });
            });
            });
      });
  }

  handleLogin() {
    this.state.gapi.auth2.getAuthInstance().signIn()
      .then(() => this.setState({ isAuthenticated: this.state.gapi.auth2.getAuthInstance().isSignedIn.get()}));
  }

  handleSwitchUser(callback) {
    this.state.gapi.auth2.getAuthInstance().signIn({ prompt: 'select_account' }).then(callback);
  }

  handleLogout() {
    this.state.gapi.auth2.getAuthInstance().signOut()
      .then(() => this.setState( { isAuthenticated: false }));
  }

  render() {
    return this.state.isAuthenticated ?
          <Page gapi={this.state.gapi} handleLogout={this.handleLogout} handleSwitchUser={this.handleSwitchUser}/>
        : <div className="m2-splash"><h1 className="title is-1">MarkTwo</h1>
        <p>A seamless, secure, syncing markdown editor.</p>
        <div className="m2-cta">
          <button className="button is-primary">Try it now</button>
          <button className="button" onClick={this.handleLogin} ><FontAwesomeIcon icon={faGoogle} />&nbsp;&nbsp;Log in with Google</button>
        </div></div>
  }
}

export default Splash;
