export const transitions = {
  composingView: {
    initial: { opacity: 1, y: 0, scale: 1 },
    exit: {
      opacity: 0,
      y: 100,
      scale: 0.95,
      transition: {
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1],
      },
    },
  },
  conversationView: {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: {
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1],
      },
    },
  },
  textarea: {
    collapsed: {
      height: '52px',
      transition: {
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1],
      },
    },
    expanded: {
      height: 'auto',
      minHeight: '120px',
      transition: {
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1],
      },
    },
  },
  message: {
    initial: { opacity: 0, y: 20 },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1],
      },
    },
  },
  inputBar: {
    initial: { opacity: 0, y: 20 },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.3,
        delay: 0.1,
        ease: [0.4, 0, 0.2, 1],
      },
    },
  },
};

export const springTransition = {
  type: 'spring',
  stiffness: 500,
  damping: 30,
};