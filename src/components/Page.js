import React from 'react';
import './Page.scss'
import $ from 'jquery';
import showdown from 'showdown';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';


class Page extends React.Component {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    const converter = new showdown.Converter();
    const turndownService = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
    turndownService.use(gfm);

    let selectedBlock;
    $('#m2-page').on('keydown keyup mousedown mouseup', (e) => {
      console.log('anchorNode:');
      console.log(window.getSelection().anchorNode);
      let oldSelectedBlock;
      if(selectedBlock) {
        oldSelectedBlock = selectedBlock;
      }
      selectedBlock = $(window.getSelection().anchorNode).closest('#m2-page > *');
      console.log('selectedBlock:');
      console.log(selectedBlock);

      // make sure selected block is in edit mode
      console.log(selectedBlock.data('editMode'));
      if(selectedBlock && selectedBlock[0] && !selectedBlock.data('editMode')) {
        console.log('markdown:');
        console.log(selectedBlock[0] && turndownService.turndown(selectedBlock[0].outerHTML));
        //let editMode = $(`<pre>${turndownService.turndown(selectedBlock[0].outerHTML) || '<br />'}</pre>`);
        selectedBlock.html(turndownService.turndown(selectedBlock[0].outerHTML) || '<br />');

        var range = document.createRange();
        var sel = window.getSelection();
        range.setStart(selectedBlock[0], 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        selectedBlock.data('editMode', true);
        selectedBlock.css('white-space', 'pre');
        //selectedBlock.css('background-color', '#fafafa');
      }

      // reset the old node upon exit
      if(oldSelectedBlock && oldSelectedBlock[0] && selectedBlock && selectedBlock[0] && !oldSelectedBlock[0].isSameNode(selectedBlock[0])) {
        console.log('rendered markdown:')
        console.log(oldSelectedBlock[0].innerHTML);
        console.log('html:');
        console.log(converter.makeHtml(oldSelectedBlock[0].innerHTML));
        oldSelectedBlock.replaceWith(converter.makeHtml(oldSelectedBlock[0].innerHTML).replace(/\\/g, ''));
      }

    });
  }

  render() {
    return <div id="m2-page" className="m2-page content" contentEditable="true">
    <h1>beef</h1>
    <div>cow</div>
      </div>
  }
}

export default Page;
