/**
 * Dynamically generate UI controls from flag definitions
 */

let allFlags = {};

async function loadFlagDefinitions() {
  try {
    const response = await fetch('/flag-definitions');
    allFlags = await response.json();
    generateDynamicUI();
  } catch (error) {
    console.error('Failed to load flag definitions:', error);
  }
}

function generateDynamicUI() {
  // Group flags by section
  const sections = {};
  
  for (const [flagName, flagDef] of Object.entries(allFlags)) {
    const section = flagDef.section || 'other';
    if (!sections[section]) {
      sections[section] = [];
    }
    sections[section].push({ name: flagName, ...flagDef });
  }

  // Sort sections
  const sectionOrder = ['essential', 'gpu', 'performance', 'cache', 'rope', 'sampling', 'network', 'memory', 'cpu', 'features', 'logging', 'routing', 'speculative', 'attention', 'other', 'info'];
  const sortedSections = sectionOrder.filter(s => s in sections).concat(
    Object.keys(sections).filter(s => !sectionOrder.includes(s))
  );

  // Generate UI sections
  const form = document.getElementById('server-config');
  const essentialSection = form.querySelector('.form-section');
  
  // Clear existing dynamic sections
  const existingSections = form.querySelectorAll('.form-section.dynamic-section');
  existingSections.forEach(s => s.remove());

  // Add remaining essential flags to the existing essential section
  if (sections['essential']) {
    const essentialSection = form.querySelector('.form-section');
    const essentialGrid = essentialSection.querySelector('.form-grid');
    
    for (const flag of sections['essential']) {
      // Skip model since it's already there
      if (flag.name !== 'model') {
        const control = createFormControl(flag);
        essentialGrid.appendChild(control);
      }
    }
  }

  // Generate other sections (skip essential and info)
  for (const section of sortedSections) {
    if (section === 'essential' || section === 'info') continue;
    
    const sectionEl = createFormSection(section, sections[section]);
    form.appendChild(sectionEl);
  }

  // Populate forms with defaults
  populateFormDefaults();
}

function createFormSection(sectionName, flags) {
  const section = document.createElement('div');
  section.className = 'form-section dynamic-section';
  
  const title = document.createElement('h3');
  title.textContent = capitalize(sectionName) + ' Settings';
  section.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'form-grid';

  for (const flag of flags) {
    const control = createFormControl(flag);
    grid.appendChild(control);
  }

  section.appendChild(grid);
  return section;
}

function createFormControl(flag) {
  const group = document.createElement('div');
  group.className = 'form-group';

  let input;
  
  switch (flag.type) {
    case 'boolean':
      // For boolean, create a label wrapper with checkbox on the right
      group.className = 'form-group form-group-boolean';
      
      const labelWrapper = document.createElement('div');
      labelWrapper.className = 'checkbox-label-wrapper';
      
      const label = document.createElement('label');
      label.className = 'checkbox-title';
      label.textContent = capitalize(flag.name);
      if (flag.required) {
        label.innerHTML += ' <span class="required">*</span>';
      }
      
      input = document.createElement('input');
      input.type = 'checkbox';
      input.id = flag.name;
      input.name = flag.name;
      input.checked = flag.default === true || flag.default === 'true';
      input.className = 'checkbox-input';
      
      labelWrapper.appendChild(label);
      labelWrapper.appendChild(input);
      group.appendChild(labelWrapper);
      
      const small = document.createElement('small');
      small.textContent = flag.description;
      group.appendChild(small);
      
      return group;

    case 'select':
      const selectLabel = document.createElement('label');
      selectLabel.htmlFor = flag.name;
      selectLabel.textContent = capitalize(flag.name);
      if (flag.required) {
        selectLabel.innerHTML += ' <span class="required">*</span>';
      }
      group.appendChild(selectLabel);
      
      input = document.createElement('select');
      input.id = flag.name;
      input.name = flag.name;
      // Add empty option if no default
      if (!flag.default) {
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '-- None --';
        emptyOpt.selected = true;
        input.appendChild(emptyOpt);
      }
      if (flag.options) {
        for (const option of flag.options) {
          const opt = document.createElement('option');
          opt.value = option;
          opt.textContent = option;
          if (option === flag.default) opt.selected = true;
          input.appendChild(opt);
        }
      }
      break;

    case 'number':
      const numLabel = document.createElement('label');
      numLabel.htmlFor = flag.name;
      numLabel.textContent = capitalize(flag.name);
      if (flag.required) {
        numLabel.innerHTML += ' <span class="required">*</span>';
      }
      group.appendChild(numLabel);
      
      input = document.createElement('input');
      input.type = 'number';
      input.id = flag.name;
      input.name = flag.name;
      if (flag.default !== undefined) {
        input.value = flag.default;
      }
      // Set appropriate step for decimal numbers
      if (flag.name.includes('temp') || flag.name.includes('penalty') || flag.name.includes('scale') || flag.name.includes('factor')) {
        input.step = '0.01';
      }
      break;

    case 'file':
      const fileLabel = document.createElement('label');
      fileLabel.htmlFor = flag.name;
      fileLabel.textContent = capitalize(flag.name);
      if (flag.required) {
        fileLabel.innerHTML += ' <span class="required">*</span>';
      }
      group.appendChild(fileLabel);
      
      input = document.createElement('input');
      input.type = flag.name === 'model' ? 'text' : 'file';
      input.id = flag.name;
      input.name = flag.name;
      if (flag.default) input.value = flag.default;
      break;

    default:
      const defaultLabel = document.createElement('label');
      defaultLabel.htmlFor = flag.name;
      defaultLabel.textContent = capitalize(flag.name);
      if (flag.required) {
        defaultLabel.innerHTML += ' <span class="required">*</span>';
      }
      group.appendChild(defaultLabel);
      
      input = document.createElement('input');
      input.type = 'text';
      input.id = flag.name;
      input.name = flag.name;
      if (flag.default !== undefined) {
        input.value = flag.default;
      }
      break;
  }

  group.appendChild(input);

  const small = document.createElement('small');
  small.textContent = flag.description;
  group.appendChild(small);

  return group;
}

function populateFormDefaults() {
  const form = document.getElementById('server-config');
  
  for (const [flagName, flagDef] of Object.entries(allFlags)) {
    const input = form.elements[flagName];
    if (!input) continue;

    if (flagDef.type === 'boolean') {
      input.checked = flagDef.default === true || flagDef.default === 'true';
    } else if (flagDef.default !== undefined && flagDef.default !== null) {
      input.value = flagDef.default;
    }
  }
}

function capitalize(str) {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getFormValues() {
  const form = document.getElementById('server-config');
  const values = {};

  for (const [flagName, flagDef] of Object.entries(allFlags)) {
    const input = form.elements[flagName];
    if (!input) continue;

    let value = null;

    if (flagDef.type === 'boolean') {
      value = input.checked;
    } else if (flagDef.type === 'number') {
      const num = parseFloat(input.value);
      value = isNaN(num) ? null : num;
    } else {
      value = input.value || null;
    }

    // Only include if value is not null/empty and not equal to default
    if (value !== null && value !== '' && value !== undefined) {
      const hasDefault = 'default' in flagDef;
      const isDefaultValue = hasDefault && flagDef.default === value;
      
      if (!isDefaultValue) {
        values[flagName] = value;
      }
    }
  }

  return values;
}

// Load flags when page loads
document.addEventListener('DOMContentLoaded', () => {
  loadFlagDefinitions();
  // Dispatch custom event when UI is ready
  setTimeout(() => {
    document.dispatchEvent(new Event('dynamicUIReady'));
  }, 100);
});
