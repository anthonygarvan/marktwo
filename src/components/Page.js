import React from 'react';
import './Page.scss'
import $ from 'jquery';
import showdown from 'showdown';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import _ from 'lodash';
import marked from 'marked';


class Page extends React.Component {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    const converter = new showdown.Converter();
    TurndownService.prototype.escape = text => text; // disable escaping characters
    const turndownService = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
    marked.setOptions({
      smartLists: true,
    })
    turndownService.use(gfm);

    let selectedBlock;
    $('#m2-page').on('keyup keydown mouseup', (e) => {
      console.log(e);
      let oldSelectedBlock;
      if(selectedBlock) {
        oldSelectedBlock = selectedBlock;
      }

      let sel = window.getSelection();
      console.log('selection:');
      console.log(sel);
      console.log('anchorNode:');
      console.log(sel.anchorNode);
      const originalAnchorText = sel.anchorNode.data;
      selectedBlock = $(sel.anchorNode).closest('#m2-page > *');
      console.log('selectedBlock:');
      console.log(selectedBlock);

      if(e.key === 'Enter' && e.type === 'keydown' && selectedBlock
          && selectedBlock[0] && !(sel.anchorNode.data === '\n\u200B' || (sel.anchorNode.tagName === 'BR'))) {
        console.log(e);
        e.preventDefault();

        let range;
        if(sel.getRangeAt && sel.rangeCount) {
                range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode('\n\u200B'));
                sel.anchorNode.nextSibling && sel.collapse(sel.anchorNode.nextSibling, sel.anchorNode.nextSibling.length);
        }
      }

      // make sure selected block is in edit mode
      console.log(selectedBlock.data('editMode'));
      if(selectedBlock && selectedBlock[0] && !selectedBlock.data('editMode')) {
        console.log('markdown:');
        console.log(selectedBlock[0] && turndownService.turndown(selectedBlock[0].outerHTML));

        console.log('selection before toggling to edit');
        console.log(sel)
        const anchorOffset = sel.anchorOffset;
        selectedBlock.html(turndownService.turndown(selectedBlock[0].outerHTML) || '<br />');
        console.log('selection after toggling to edit');
        console.log(sel)
        var range = document.createRange();
        let offset;
        if(selectedBlock[0].firstChild && selectedBlock[0].firstChild.data) {
          const stringMatch = selectedBlock[0].firstChild.data.match(new RegExp(originalAnchorText));
          const stringIndex = stringMatch ? stringMatch.index : 0;
          offset = stringIndex + anchorOffset;
        } else {
          offset = 0;
        }
        range.setStart(selectedBlock[0].firstChild, offset);
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
        let markdown = oldSelectedBlock[0].innerText.replace(/\u200B/g, '');
        console.log(markdown);
        console.log('html:');
        let html = marked(markdown);
        console.log(html);
        oldSelectedBlock.replaceWith(html.replace(/\\/g, '') || '<p><br /></p>');
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
