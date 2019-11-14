import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faEllipsisV } from '@fortawesome/free-solid-svg-icons';
import './Shelf.scss';

class Shelf extends React.Component {
  constructor(props) {
    super(props);
    this.getUserProfile = this.getUserProfile.bind(this);
  }

  componentDidMount() {
    this.getUserProfile();
  }

  getUserProfile() {
    if(this.props.tryItNow) {
      this.setState({ userEmail: 'anonymous.bunny@gmail.com', photoUrl: '/img/anonymous.png', userName: 'Anonymous Bunny' });
    } else {
      const profile = this.props.gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile();
      this.setState({ userEmail: profile.getEmail(), photoUrl: profile.getImageUrl(), userName: profile.getName() })
    }
  }

  render() {
    return this.props.showShelf ? <div className="m2-shelf">
    <div className="m2-profile">
      <div className="m2-profile-photo"><img src={this.state.photoUrl} alt="profile" /></div>
      <div className="m2-username">{this.state.userName}</div>
      <div className="m2-email">{this.state.userEmail}</div>
      <div className="m2-switch-user">
        <button className="button is-clear" onClick={() => this.props.handleSwitchUser}>Switch user</button>
        <button className="button is-clear" onClick={this.props.handleLogout}>Sign out</button>
      </div>
    </div>
    <div className="m2-menu-links">
      <div><a onClick={() => this.props.showDocs(true)}>Docs</a></div>
      <div><a onClick={this.props.showSearch}>Search</a></div>
    </div>
    <div className="m2-menu-footer">
      <a onClick={this.props.showAbout}>About</a>
    </div>
      <a className="m2-close" onClick={() => this.props.setShelf(false)}><FontAwesomeIcon icon={faTimes} /></a>
    </div>
    : <div className="m2-menu"><a onClick={() => this.props.setShelf(true)}><FontAwesomeIcon icon={faEllipsisV} /></a></div>
  }
}

export default Shelf;
