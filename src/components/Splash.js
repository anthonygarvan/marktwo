import React from 'react';
import getGoogleApi from 'google-client-api';
import MarkTwo from './MarkTwo';
import './Splash.scss';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGoogle } from '@fortawesome/free-brands-svg-icons';


class Splash extends React.Component {
  constructor(props) {
    super(props);
    this.handleLogin = this.handleLogin.bind(this);
    this.handleLogout = this.handleLogout.bind(this);
    this.handleSwitchUser = this.handleSwitchUser.bind(this);
    this.state = { tryItNow: false, isAuthenticated: null };
  }

  componentWillMount() {
    getGoogleApi().then(googleApi => {
            const gapi = googleApi;
            gapi.load('client:auth2', () => {

              const initSettings = {
                client_id: '346746556737-32h3br6e6beeerm71norabl2icv4rl7e.apps.googleusercontent.com',
                scope: 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
                discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
                response_type: 'id_token permission'}

              gapi.client.init(initSettings).then(() => {
                  let isAuthenticated = gapi.auth2.getAuthInstance().isSignedIn.get();
                  if(isAuthenticated) {
                    const userEmail = gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile().getEmail();
                    this.setState({ isAuthenticated, gapi, userEmail });
                } else {
                  this.setState({ isAuthenticated, gapi });
                }
            });
            });
      });
  }

  handleLogin() {
    this.state.gapi.auth2.getAuthInstance().signIn()
      .then(() => {
        const userEmail = this.state.gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile().getEmail();
        this.setState({ isAuthenticated: this.state.gapi.auth2.getAuthInstance().isSignedIn.get(), userEmail });
      });
  }

  handleSwitchUser(callback) {
    this.state.gapi.auth2.getAuthInstance().signIn({ prompt: 'select_account' }).then(() => {
      const userEmail = this.state.gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile().getEmail();
      this.setState({ userEmail });
      callback()});
  }

  handleLogout() {
    this.state.gapi.auth2.getAuthInstance().signOut()
      .then(() => this.setState( { isAuthenticated: false }));
  }

  render() {
    return <div>{this.state.tryItNow && <MarkTwo
        gapi={this.state.gapi}
        handleLogout={() => this.setState({ tryItNow: false })}
        handleSwitchUser={() => alert("Sorry! Can't switch users in anonymous mode.")}
        tryItNow={true} />}
      {!this.state.tryItNow && this.state.isAuthenticated &&
          <MarkTwo key={this.state.userEmail}
            userEmail={this.state.userEmail}
            gapi={this.state.gapi}
            handleLogout={this.handleLogout}
            handleSwitchUser={this.handleSwitchUser}
            tryItNow={false} />}
      {!this.state.tryItNow && this.state.isAuthenticated === null && <div className="m2-load-screen">
            <h1 className="title is-1"><img src="/img/logo512.png" alt="logo" />MarkTwo<img src="/img/logo512.png" alt="logo" /></h1>
        </div>}
      {!this.state.tryItNow && this.state.isAuthenticated === false && <div className="m2-splash">
      <h1 className="title is-1"><img src="/img/logo512.png" alt="logo" />MarkTwo<img src="/img/logo512.png" alt="logo" /></h1>
      <p>A seamless, speedy, syncing markdown editor.</p>
        <div className="m2-cta">
          <button className="button is-primary is-outlined" onClick={() => this.setState({ tryItNow: true })}>Try it now</button>
          <button className="button is-primary is-outlined" onClick={this.handleLogin} ><FontAwesomeIcon icon={faGoogle} />&nbsp;&nbsp;Log in with Google</button>
        </div>

        <div className="m2-tiles">
        <div className="columns">
            <div className="column">
                <h4 className="title is-4">Seamless</h4>
                <p>Read and edit markdown from a single view.</p>
            </div>
            <div className="column">
              <h4 className="title is-4">Speedy</h4>
              <p>Big doc? No problem.</p>
            </div>
            <div className="column">
              <h4 className="title is-4">Syncing</h4>
              <p>Works across devices, always synced.</p>
            </div>
        </div>

        <div className="columns">
            <div className="column">
                <h4 className="title is-4">Private</h4>
                <p>Even we can't see your documents.</p>
            </div>
            <div className="column">
              <h4 className="title is-4">Searchable</h4>
              <p>Fast, clear search results.</p>
            </div>
            <div className="column">
              <h4 className="title is-4">Free</h4>
              <p>Free and open source.</p>
            </div>
        </div>
      </div>
    </div>}</div>
  }
}

export default Splash;
