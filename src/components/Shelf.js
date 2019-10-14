import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronRight, faTimes } from '@fortawesome/free-solid-svg-icons';
import './Shelf.scss';

class Shelf extends React.Component {
  constructor(props) {
    super(props);
    this.getUserProfile = this.getUserProfile.bind(this);
    this.state = { showShelf: false }
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
    return this.state.showShelf ? <div className="m2-shelf">
    <div className="m2-profile">
      <div className="m2-profile-photo"><img src={this.state.photoUrl} alt="profile" /></div>
      <div className="m2-username">{this.state.userName}</div>
      <div className="m2-email">{this.state.userEmail}</div>
      <div className="m2-switch-user">
        <button className="button is-clear" onClick={() => this.props.handleSwitchUser(this.getUserProfile)}>Switch user</button>
        <button className="button is-clear" onClick={this.props.handleLogout}>Sign out</button>
      </div>
    </div>
    <div className="m2-menu-links">
      <div><a onClick={() => this.props.showFiles(true)}>Files</a></div>
      <div><a onClick={this.props.showSearch}>Search</a></div>
      <div><a onClick={this.props.showSettings}>Settings</a></div>
    </div>
      <a className="m2-close" onClick={() => this.setState({ showShelf: false })}><FontAwesomeIcon icon={faTimes} /></a>
    </div>
    : <div className="m2-chevron"><a onClick={() => this.setState({ showShelf: true })}><FontAwesomeIcon icon={faChevronRight} /></a></div>
  }
}

export default Shelf;
