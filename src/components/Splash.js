import React from 'react';
import getGoogleApi from 'google-client-api';
import MarkTwo from './MarkTwo';
import './Splash.scss';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGoogle } from '@fortawesome/free-brands-svg-icons';
import $ from 'jquery';
import logo from '../img/logo512.png';


class Splash extends React.Component {
  constructor(props) {
    super(props);
    this.handleLogin = this.handleLogin.bind(this);
    this.handleLogout = this.handleLogout.bind(this);
    this.handleSwitchUser = this.handleSwitchUser.bind(this);
    this.state = { tryItNow: document.location.pathname.startsWith('/try-it-now'), isAuthenticated: null };
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
                    try {
                      window.gtag('event', 'login', {'method': 'Google'});
                    } catch {}
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
    try {
      window.gtag('event', 'sign_up', {'method': 'Google'});
    } catch {}

    this.state.gapi.auth2.getAuthInstance().signIn()
      .then(() => {
        const isAuthenticated = this.state.gapi.auth2.getAuthInstance().isSignedIn.get();
        if(isAuthenticated) {
          const userEmail = this.state.gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile().getEmail();
          this.setState({ isAuthenticated, userEmail });
          $('.m2-is-signed-out').hide();
        }
      });
  }

  handleSwitchUser() {
    this.state.gapi.auth2.getAuthInstance().signIn({ prompt: 'select_account' }).then(() => {
      window.location.reload();
    });
  }

  handleLogout() {
    this.state.gapi.auth2.getAuthInstance().signOut()
      .then(() => this.setState( { isAuthenticated: false }, () => $(window).scrollTop(0)));
  }

  render() {
    return <div>{this.state.tryItNow && <MarkTwo
        gapi={this.state.gapi}
        handleLogout={() => window.location = "/"}
        handleLogin={() => alert("You're in anonymous mode! To log in please sign in under your google account")}
        handleSwitchUser={() => alert("Sorry! Can't switch users in anonymous mode.")}
        tryItNow={true} />}
      {!this.state.tryItNow && this.state.isAuthenticated &&
          <MarkTwo key={this.state.userEmail}
            userEmail={this.state.userEmail}
            gapi={this.state.gapi}
            handleLogout={this.handleLogout}
            handleLogin={this.handleLogin}
            handleSwitchUser={this.handleSwitchUser}
            tryItNow={false} />}
      {!this.state.tryItNow && this.state.isAuthenticated === null && <div className="m2-load-screen">
            <h1 className="title is-1"><img src={logo} alt="logo" />MarkTwo<img src={logo} alt="logo" /></h1>
        </div>}
      {!this.state.tryItNow && this.state.isAuthenticated === false && <div className="m2-splash">
      <div className="m2-hero"><h1 className="title is-1"><img src={logo} alt="logo" />MarkTwo<img src={logo} alt="logo" /></h1>
      <p>A seamless, speedy, syncing markdown editor.</p>
        <div className="m2-cta">
          <a className="button is-primary is-outlined" href="/try-it-now">Try it now</a>
          <button className="button is-primary is-outlined" onClick={this.handleLogin} ><FontAwesomeIcon icon={faGoogle} />&nbsp;&nbsp;Log in with Google</button>
        </div></div>

        <div className="m2-tiles">
        <div className="columns">
            <div className="column">
                <h4 className="title is-4">Seamless</h4>
                <p>Read and edit markdown from a single view. No need to toggle back and forth.</p>
            </div>
            <div className="column">
              <h4 className="title is-4">Speedy</h4>
              <p>Writing the next War & Peace? No problem, MarkTwo can handle large documents.</p>
            </div>
            <div className="column">
              <h4 className="title is-4">Syncing</h4>
              <p>MarkTwo is web-native, so it works across devices, and your docs are always synced.</p>
            </div>
        </div>

        <div className="columns">
            <div className="column">
                <h4 className="title is-4">Private</h4>
                <p>MarkTwo is a static app backed by your own Google Drive&mdash;we don't store any of your data.</p>
            </div>
            <div className="column">
              <h4 className="title is-4">Searchable</h4>
              <p>Using MarkTwo for notes? Easily find what you're looking for with fast, clear search results.</p>
            </div>
            <div className="column">
              <h4 className="title is-4">Free</h4>
              <p>No lock-in&mdash;MarkTwo is free and open source, and you can export your docs at any time.</p>
            </div>
        </div>
      </div>
    </div>}</div>
  }
}

export default Splash;
